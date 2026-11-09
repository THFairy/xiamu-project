import {
  BackendRecycleSettlement,
  BackendWechatPaymentParams,
  claimRecycleSettlement,
  confirmWechatBatchPayment,
  confirmWechatPayment,
  createWechatBatchPayment,
  createWechatPayment,
  syncRecycleSettlement,
} from './backend'

const invokeWechatPayment = (payment: BackendWechatPaymentParams): Promise<void> => {
  if (payment.mode === 'mock') {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    wx.requestPayment({
      timeStamp: payment.timeStamp,
      nonceStr: payment.nonceStr,
      package: payment.package,
      signType: payment.signType,
      paySign: payment.paySign,
      success: () => resolve(),
      fail: (error) => {
        const errorMessage = typeof error?.errMsg === 'string' ? error.errMsg : ''

        if (errorMessage.includes('requestPayment:fail cancel') || errorMessage.includes('cancel')) {
          reject(new Error('已取消支付'))
          return
        }

        reject(new Error(errorMessage || '微信支付失败'))
      },
    })
  })
}

export const payPendingPurchaseOrders = async (orderIds: number[]): Promise<void> => {
  const normalizedOrderIds = Array.from(new Set(orderIds.filter((orderId) => Number.isFinite(orderId) && orderId > 0)))

  if (!normalizedOrderIds.length) {
    throw new Error('没有可支付的订单')
  }

  if (normalizedOrderIds.length === 1) {
    const orderId = normalizedOrderIds[0]
    const { payment } = await createWechatPayment(orderId)

    await invokeWechatPayment(payment)
    await confirmWechatPayment(orderId)
    return
  }

  const { payment, batch } = await createWechatBatchPayment(normalizedOrderIds)

  await invokeWechatPayment(payment)

  if (batch?.id) {
    await confirmWechatBatchPayment(batch.id)
    return
  }

  await Promise.all(normalizedOrderIds.map((orderId) => confirmWechatPayment(orderId)))
}

const invokeMerchantTransfer = (settlement: BackendRecycleSettlement): Promise<void> => {
  return new Promise((resolve, reject) => {
    const requester = (wx as WechatMiniprogram.Wx & {
      requestMerchantTransfer?: (options: {
        mchId: string
        appId?: string
        package: string
        success?: () => void
        fail?: (error?: { errMsg?: string }) => void
      }) => void
    }).requestMerchantTransfer

    const packageValue = String(settlement.packageInfo || '').trim()
    const mchId = String(settlement.mchId || '').trim()
    const appId = String(settlement.appId || '').trim()

    if (packageValue.startsWith('mock_') || packageValue.startsWith('mock-package') || packageValue.startsWith('mock_package')) {
      resolve()
      return
    }

    if (typeof requester !== 'function') {
      reject(new Error('当前微信基础库不支持领取资金'))
      return
    }

    if (!mchId || !packageValue) {
      reject(new Error('待收款参数不完整，请联系管理员重试'))
      return
    }

    requester({
      mchId,
      appId: appId || undefined,
      package: packageValue,
      success: () => resolve(),
      fail: (error) => {
        const errorMessage = typeof error?.errMsg === 'string' ? error.errMsg : ''
        if (errorMessage.includes('cancel')) {
          reject(new Error('已取消领取'))
          return
        }

        reject(new Error(errorMessage || '领取资金失败'))
      },
    })
  })
}

export const claimPendingRecycleSettlement = async (
  recycleOrderId: number,
  maxAttempts = 15,
  intervalMs = 1000,
): Promise<BackendRecycleSettlement | null> => {
  const settlement = await claimRecycleSettlement(recycleOrderId)

  if (!settlement?.packageInfo) {
    throw new Error('暂无可领取资金')
  }

  await invokeMerchantTransfer(settlement)

  let lastSettlement: BackendRecycleSettlement | null = settlement
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const nextSettlement = await syncRecycleSettlement(recycleOrderId)
    if (nextSettlement) {
      lastSettlement = nextSettlement
    }

    const settlementState = String(lastSettlement?.state || '').trim().toUpperCase()
    if (settlementState === 'SUCCESS' || settlementState === 'FAIL' || settlementState === 'CANCEL') {
      return lastSettlement
    }

    if (attempt < maxAttempts - 1) {
      await new Promise<void>((resolve) => {
        setTimeout(() => resolve(), intervalMs)
      })
    }
  }

  return lastSettlement
}
