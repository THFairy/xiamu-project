// 用途：调起微信官方确认收货组件，并仅在用户明确确认后返回成功状态。

interface WechatOrderConfirmExtraData {
  status?: 'success' | 'fail' | 'cancel'
  errormsg?: string
  req_extradata?: {
    merchant_id?: string
    merchant_trade_no?: string
    transaction_id?: string
  }
}

interface WechatOrderConfirmResponse {
  errMsg?: string
  extraData?: WechatOrderConfirmExtraData
  referrerInfo?: {
    extraData?: WechatOrderConfirmExtraData
  }
}

interface OpenBusinessViewOptions {
  businessType: 'weappOrderConfirm'
  extraData: {
    merchant_id: string
    merchant_trade_no: string
    transaction_id: string
  }
  success: (response: WechatOrderConfirmResponse) => void
  fail: (error: { errMsg?: string }) => void
}

interface WechatBusinessViewApi {
  openBusinessView?: (options: OpenBusinessViewOptions) => void
  onAppShow?: (listener: (options: WechatOrderConfirmResponse) => void) => void
  offAppShow?: (listener: (options: WechatOrderConfirmResponse) => void) => void
}

export interface WechatReceiptConfirmationParams {
  merchantId: string
  merchantTradeNo: string
  transactionId: string
}

export type WechatReceiptConfirmationResult = 'confirmed' | 'returned'

export const confirmReceiptWithWechat = (params: WechatReceiptConfirmationParams): Promise<WechatReceiptConfirmationResult> => new Promise((resolve, reject) => {
  const merchantId = String(params.merchantId || '').trim()
  const merchantTradeNo = String(params.merchantTradeNo || '').trim()
  const transactionId = String(params.transactionId || '').trim()
  if (!merchantId || !merchantTradeNo || !transactionId) {
    reject(new Error('微信订单信息不完整，暂时无法确认收货'))
    return
  }

  const wechatApi = wx as unknown as WechatBusinessViewApi
  if (typeof wechatApi.openBusinessView !== 'function') {
    reject(new Error('当前微信版本不支持确认收货，请升级微信后重试'))
    return
  }
  const openBusinessView = wechatApi.openBusinessView.bind(wechatApi)

  let waitingForReturn = false
  let settled = false
  let timeoutId = 0

  const cleanup = () => {
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = 0
    }
    wechatApi.offAppShow?.(handleAppShow)
  }

  const finish = (result?: WechatReceiptConfirmationResult, error?: Error) => {
    if (settled) {
      return
    }
    settled = true
    cleanup()
    if (error) {
      reject(error)
      return
    }
    resolve(result || 'returned')
  }

  const handleResult = (response: WechatOrderConfirmResponse): boolean => {
    const extraData = response.referrerInfo?.extraData || response.extraData
    const status = String(extraData?.status || '').trim()
    if (!status) {
      return false
    }

    const requestedTransactionId = String(extraData?.req_extradata?.transaction_id || '').trim()
    if (requestedTransactionId && requestedTransactionId !== transactionId) {
      finish(undefined, new Error('微信返回的订单信息不一致，请重新操作'))
      return true
    }

    if (status === 'success') {
      finish('confirmed')
      return true
    }

    if (status === 'cancel') {
      finish('returned')
      return true
    }

    finish(undefined, new Error(extraData?.errormsg || '微信确认收货未完成，请稍后重试'))
    return true
  }

  function handleAppShow(response: WechatOrderConfirmResponse) {
    if (!waitingForReturn || settled) {
      return
    }

    if (!handleResult(response)) {
      finish('returned')
    }
  }

  wechatApi.onAppShow?.(handleAppShow)
  timeoutId = setTimeout(() => {
    finish(undefined, new Error('微信确认收货等待超时，请重新操作'))
  }, 5 * 60 * 1000) as unknown as number

  openBusinessView({
    businessType: 'weappOrderConfirm',
    extraData: {
      merchant_id: merchantId,
      merchant_trade_no: merchantTradeNo,
      transaction_id: transactionId,
    },
    success: (response) => {
      if (!handleResult(response)) {
        waitingForReturn = true
      }
    },
    fail: (error) => {
      finish(undefined, new Error(error.errMsg || '微信确认收货组件打开失败'))
    },
  })
})
