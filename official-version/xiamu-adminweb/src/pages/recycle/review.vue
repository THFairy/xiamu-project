<!-- 回收审核页面：展示并管理客户提交的回收信息。 -->
<!-- 用途：回收审核页面，展示回收类目和审核流程。 -->
<!-- 用途：回收审核、检测及库存记录联动界面。 -->
<template>
    <div class="recycle-review-page">
        <el-card shadow="never" class="border-0">
            <div class="mb-5 flex items-start justify-between gap-4">
                <div>
                    <h2 class="text-lg font-semibold text-gray-800">回收审核</h2>
                    <p class="mt-1 text-sm text-gray-500">
                        这里统一检测顾客提交的回收商品，可在同一页面核对用户记录并登记商品信息。
                    </p>
                </div>
            </div>

            <search-header :model="searchForm" permission="searchRecycleSubmission,GET" actions-right-on-expand @search="getData(1)" @reset="resetSearch">
                <search-header-item label="关键词" prop="title">
                    <el-input v-model="searchForm.title" placeholder="顾客昵称 / 手机号 / 商品名称 / 顺丰单号" clearable></el-input>
                </search-header-item>
                <template #show>
                    <search-header-item label="审核状态" prop="status">
                        <el-select v-model="searchForm.status" placeholder="全部状态" clearable>
                            <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
                        </el-select>
                    </search-header-item>
                    <search-header-item label="回收类目" prop="categoryKey">
                        <el-select v-model="searchForm.categoryKey" placeholder="全部类目" clearable>
                            <el-option v-for="item in recycleCategories" :key="item.id" :label="item.label || item.name" :value="item.key" />
                        </el-select>
                    </search-header-item>
                </template>
            </search-header>

            <list-header
                :permissions="{
                    delete: 'deleteRecycleSubmission,POST',
                    refresh: 'getRecycleSubmissionList,GET',
                }"
                @delete="handleDeleteSubmissions"
                @refresh="getData(currentPage)"
            >
                <el-button v-if="canCreateRecycleSubmission" type="primary" size="small" @click="handleOpenManualCreate">手动新增</el-button>
            </list-header>

            <el-table id="recycle-review-table" ref="reviewTableRef" :data="tableData" stripe @selection-change="handleSelectionChange">
                <el-table-column type="selection" width="55" fixed="left"></el-table-column>
                <el-table-column label="回收订单编号" width="190" fixed="left" show-overflow-tooltip>
                    <template #default="{ row }">{{ row.orderNo || '-' }}</template>
                </el-table-column>
                <el-table-column label="顾客提交" min-width="280">
                    <template #default="{ row }">
                        <div class="flex items-start gap-3">
                            <el-image
                                v-if="row.coverImage"
                                class="cover-image"
                                :src="row.coverImage"
                                fit="cover"
                                :preview-src-list="[row.coverImage]"
                            />
                            <div v-else class="cover-chip" :class="`cover-chip-${row.coverTheme}`">{{ row.coverLabel || '回收' }}</div>
                            <div class="min-w-0 flex-1">
                                <div class="truncate font-medium text-gray-800">{{ row.title }}</div>
                                <div class="mt-1 text-xs text-gray-500">{{ row.optionSummary || '未填写简介' }}</div>
                                <div class="mt-1 text-xs text-gray-400">顾客：{{ row.userNickname || '未命名用户' }} / {{ row.userPhone || '-' }}</div>
                                <div class="mt-1 text-xs text-gray-400">UID：{{ row.uid || '-' }}</div>
                            </div>
                        </div>
                    </template>
                </el-table-column>
                <el-table-column label="提交时间" width="170">
                    <template #default="{ row }">{{ formatTimestampValue(row.createdAt) || '-' }}</template>
                </el-table-column>
                <el-table-column v-if="canViewWaybillNo" label="顺丰单号" min-width="160" show-overflow-tooltip>
                    <template #default="{ row }">{{ row.sfWaybillNo || '-' }}</template>
                </el-table-column>
                <el-table-column label="物品来源" min-width="140" show-overflow-tooltip>
                    <template #default="{ row }">{{ row.itemSource || '微信小程序' }}</template>
                </el-table-column>
                <el-table-column label="估价" width="120">
                    <template #default="{ row }">
                        <div class="text-sm text-gray-700">{{ row.estimateFinalPrice || 0 }}</div>
                        <div class="text-xs text-gray-400">{{ row.estimateSupported ? '规则估价' : '人工估价' }}</div>
                    </template>
                </el-table-column>
                <el-table-column label="图片" width="110">
                    <template #default="{ row }">
                        <div class="text-sm text-gray-700">{{ row.submissionImages.length }} 张</div>
                    </template>
                </el-table-column>
                <el-table-column label="状态 / 收款方式" width="150">
                    <template #default="{ row }">
                        <div class="flex flex-col items-start gap-1">
                            <el-tag v-if="row.userStatus === 'cancelled'" size="small" type="warning">用户已取消</el-tag>
                            <el-tag v-else-if="row.userResponseStatus" size="small" :type="getUserResponseTagType(row.userResponseStatus)">
                                {{ getUserResponseLabel(row.userResponseStatus) }}
                            </el-tag>
                            <el-tag v-else size="small" :type="getStatusTagType(row.status)">{{ getStatusLabel(row.status) }}</el-tag>
                            <span v-if="row.userResponseStatus" class="text-xs text-gray-400">审核：{{ getStatusLabel(row.status) }}</span>
                            <span class="text-xs text-gray-500">{{ getPayoutMethodLabel(row.payoutMethodLabel) }}</span>
                        </div>
                    </template>
                </el-table-column>
                <el-table-column label="打回原因" min-width="180" show-overflow-tooltip>
                    <template #default="{ row }">{{ row.reviewNote || '-' }}</template>
                </el-table-column>
                <el-table-column label="寄回地址" min-width="280">
                    <template #default="{ row }">
                        <div v-if="row.returnAddress" class="text-sm leading-5 text-gray-700">
                            <div>{{ row.returnAddress.recipientName }} {{ row.returnAddress.recipientPhone }}</div>
                            <div class="text-xs text-gray-500">{{ formatReturnAddress(row.returnAddress) }}</div>
                        </div>
                        <span v-else class="text-gray-400">-</span>
                    </template>
                </el-table-column>
                <el-table-column label="打款状态" width="120" align="center">
                    <template #default="{ row }">
                        <el-tag v-if="row.settlement" size="small" :type="getSettlementTagType(row.settlement.state)">
                            {{ getSettlementStateLabel(row.settlement.state) }}
                        </el-tag>
                        <span v-else class="text-xs text-gray-400">未打款</span>
                    </template>
                </el-table-column>
                <el-table-column label="查看和编辑" width="130" align="center" fixed="right">
                    <template #default="{ row }">
                        <el-button type="primary" link @click="handleOpenView(row)">查看和编辑</el-button>
                    </template>
                </el-table-column>
            </el-table>

            <div class="mt-5 flex justify-center">
                <el-pagination
                    :current-page="currentPage"
                    background
                    layout="prev, pager, next"
                    :page-size="pageSize"
                    :total="total"
                    @current-change="getData"
                ></el-pagination>
            </div>
        </el-card>

        <el-dialog v-model="viewVisible" title="查看和编辑" width="min(1080px, 94vw)" class="recycle-view-dialog">
            <div v-if="currentViewRow" class="recycle-view-content">
                <section class="recycle-view-summary">
                    <div>
                        <div class="recycle-view-title">{{ currentViewRow.title || '未命名回收物品' }}</div>
                        <div class="recycle-view-order">回收订单编号：{{ currentViewRow.orderNo || '-' }}</div>
                    </div>
                    <el-tag :type="getStatusTagType(currentViewRow.status)">{{ getStatusLabel(currentViewRow.status) }}</el-tag>
                </section>
                <el-descriptions :column="3" border class="recycle-view-details">
                    <el-descriptions-item label="物品来源">{{ currentViewRow.itemSource || '微信小程序' }}</el-descriptions-item>
                    <el-descriptions-item label="顺丰单号">{{ currentViewRow.sfWaybillNo || '-' }}</el-descriptions-item>
                    <el-descriptions-item label="提交时间">{{ formatTimestampValue(currentViewRow.createdAt) || '-' }}</el-descriptions-item>
                    <el-descriptions-item label="回收类目">{{ getRecycleCategoryLabel(currentViewRow.categoryKey) }}</el-descriptions-item>
                    <el-descriptions-item label="收款方式">{{ getPayoutMethodLabel(currentViewRow.payoutMethodLabel) }}</el-descriptions-item>
                    <el-descriptions-item label="打款状态">{{ getSettlementStateLabel(currentViewRow.settlement?.state) }}</el-descriptions-item>
                    <el-descriptions-item label="收款账号">{{ currentViewRow.accountNumber || '-' }}</el-descriptions-item>
                    <el-descriptions-item label="真实姓名">{{ currentViewRow.realName || '-' }}</el-descriptions-item>
                    <el-descriptions-item label="最终估价">{{ formatEstimatePrice(currentViewRow.estimateFinalPrice) }}</el-descriptions-item>
                    <el-descriptions-item label="顾客信息" :span="3">{{ currentViewRow.note || '-' }}</el-descriptions-item>
                    <el-descriptions-item label="打回原因" :span="3">{{ currentViewRow.reviewNote || '-' }}</el-descriptions-item>
                </el-descriptions>
                <section class="recycle-view-section">
                    <div class="recycle-view-section__title">顾客图片</div>
                    <div v-if="currentViewRow.submissionImages?.length" class="customer-images-box">
                        <el-image
                            v-for="imageUrl in currentViewRow.submissionImages"
                            :key="imageUrl"
                            class="customer-image"
                            :src="imageUrl"
                            fit="cover"
                            :preview-src-list="currentViewRow.submissionImages"
                        />
                    </div>
                    <span v-else class="text-sm text-gray-400">暂无图片</span>
                </section>
                <section class="recycle-view-section">
                    <div class="recycle-view-section__title">操作</div>
                    <div class="recycle-view-actions">
                        <el-button v-if="canUpdateRecycleSubmissionInfo" @click="handleOpenInfoEditor(currentViewRow)">修改信息</el-button>
                        <el-button v-if="canEditReport" @click="handleOpenReport(currentViewRow)">编辑报告</el-button>
                        <el-button @click="handleOpenReviews(currentViewRow)">审核记录</el-button>
                        <el-button v-if="canReviewSubmission || canPublishSubmission" type="success" @click="handleOpenDetection(currentViewRow)">检测商品</el-button>
                        <el-button v-if="canSettleSubmission || canManualAlipaySettleSubmission" type="warning" @click="handleOpenSettlement(currentViewRow)">是否打款</el-button>
                    </div>
                </section>
            </div>
            <template #footer>
                <el-button @click="viewVisible = false">取消</el-button>
                <el-button type="primary" @click="saveView">保存</el-button>
            </template>
        </el-dialog>

        <el-dialog v-model="recordEditorVisible" :title="recordEditorMode === 'create' ? '手动新增回收记录' : '修改信息'" width="min(820px, 94vw)" :close-on-click-modal="!recordEditorSubmitting">
            <el-form :model="recordForm" label-width="100px" class="recycle-record-form">
                <div class="recycle-form-grid">
                    <el-form-item label="商品名称" required><el-input v-model="recordForm.title" maxlength="128" /></el-form-item>
                    <el-form-item label="回收类目"><el-select v-model="recordForm.categoryKey" filterable class="w-full"><el-option v-for="item in recycleCategories" :key="item.id" :label="item.label || item.name" :value="item.key" /></el-select></el-form-item>
                    <el-form-item label="物品来源" required><el-input v-model="recordForm.itemSource" maxlength="64" /></el-form-item>
                    <el-form-item label="顺丰单号"><el-input v-model="recordForm.sfWaybillNo" maxlength="128" /></el-form-item>
                    <el-form-item label="收款方式"><el-select v-model="recordForm.payoutMethodLabel" class="w-full" clearable><el-option label="微信零钱" value="微信零钱" /><el-option label="支付宝" value="支付宝" /></el-select></el-form-item>
                    <el-form-item label="最终估价"><el-input-number v-model="recordForm.estimateFinalPrice" :min="0" :precision="2" class="w-full" /></el-form-item>
                    <el-form-item label="收款账号"><el-input v-model="recordForm.accountNumber" maxlength="128" /></el-form-item>
                    <el-form-item label="真实姓名"><el-input v-model="recordForm.realName" maxlength="64" /></el-form-item>
                </div>
                <el-form-item label="选项摘要"><el-input v-model="recordForm.optionSummary" maxlength="255" /></el-form-item>
                <el-form-item label="顾客信息">
                    <el-input :model-value="recordForm.note" type="textarea" :rows="3" readonly />
                    <div class="mt-1 text-xs text-gray-400">顾客信息由系统自动填写，不能手动修改。</div>
                </el-form-item>
                <el-form-item label="图片"><choose-image v-model="recordForm.submissionImages" :limit="9" /></el-form-item>
            </el-form>
            <template #footer>
                <el-button :disabled="recordEditorSubmitting" @click="recordEditorVisible = false">取消</el-button>
                <el-button type="primary" :loading="recordEditorSubmitting" @click="saveRecordEditor">保存</el-button>
            </template>
        </el-dialog>

        <el-dialog
            v-model="inspectionVisible"
            title="检测商品"
            width="min(1440px, 96vw)"
            destroy-on-close
            :close-on-click-modal="!detectionSubmitting"
            :close-on-press-escape="!detectionSubmitting"
            :show-close="!detectionSubmitting"
        >
            <div v-if="inspectionCurrentRow" class="detection-layout">
            <section class="detection-panel">
                <div class="detection-panel__title">用户填写记录</div>
                <div class="detection-panel__scroll">
                <el-form ref="incorrectFormRef" :model="incorrectForm" :rules="incorrectRules" label-width="110px">
                <el-form-item label="商品名称" prop="title">
                    <el-input :model-value="incorrectForm.title" readonly></el-input>
                </el-form-item>
                <el-form-item label="回收类目" prop="categoryKey">
                    <el-input :model-value="getRecycleCategoryLabel(incorrectForm.categoryKey)" readonly></el-input>
                </el-form-item>
                <el-form-item label="收款账号" prop="accountNumber">
                    <el-input :model-value="incorrectForm.accountNumber" readonly></el-input>
                </el-form-item>
                <el-form-item label="真实姓名" prop="realName">
                    <el-input :model-value="incorrectForm.realName" readonly></el-input>
                </el-form-item>
                <el-form-item label="已选选项">
                    <div v-if="reviewOptionItems.length" class="review-option-grid">
                        <div v-for="item in reviewOptionItems" :key="item.key" class="review-option-item">
                            <span class="review-option-item__label">{{ item.label }}</span>
                            <span class="review-option-item__value">{{ item.value }}</span>
                        </div>
                    </div>
                    <span v-else class="text-sm text-gray-400">未填写选项</span>
                </el-form-item>
                <el-form-item label="顾客图片">
                    <div v-if="incorrectForm.submissionImages.length" class="customer-images-box">
                        <el-image
                            v-for="imageUrl in incorrectForm.submissionImages"
                            :key="imageUrl"
                            class="customer-image"
                            :src="imageUrl"
                            fit="cover"
                            :preview-src-list="incorrectForm.submissionImages"
                        ></el-image>
                    </div>
                    <div v-else class="customer-images-box customer-images-box--empty">暂无图片</div>
                </el-form-item>
                <el-form-item label="顾客信息">
                    <el-input
                        :model-value="formatCustomerInfo(incorrectForm.note)"
                        type="textarea"
                        :rows="4"
                        readonly
                    ></el-input>
                </el-form-item>
                <el-form-item label="基础估价">
                    <el-input :model-value="formatEstimatePrice(incorrectForm.estimateBasePrice)" readonly></el-input>
                </el-form-item>
                <el-form-item label="最终估价" prop="estimateFinalPrice">
                    <el-input-number v-model="incorrectForm.estimateFinalPrice" :min="0" :precision="2" :step="10"></el-input-number>
                </el-form-item>
                <el-form-item label="打回原因" prop="reviewNote">
                    <el-input v-model="incorrectForm.reviewNote" type="textarea" :rows="3" placeholder="请说明需要用户修改或补充的信息"></el-input>
                </el-form-item>
                </el-form>
                <div class="detection-review-actions">
                    <el-button :disabled="detectionSubmitting" :type="reviewDecision === 'needs_fix' ? 'danger' : 'default'" @click="setReviewDecision('needs_fix')">信息有错</el-button>
                    <el-button :disabled="detectionSubmitting" :type="reviewDecision === 'approved' ? 'success' : 'default'" @click="setReviewDecision('approved')">信息无误</el-button>
                    <el-button v-if="canReviewSubmission" type="primary" :loading="reviewSubmitting" :disabled="!reviewDecision" @click="submitIncorrectForm(reviewDecision)">保存审核结果</el-button>
                </div>
                </div>
            </section>
            <section class="detection-panel">
                <div class="detection-panel__title">登记产品信息</div>
                <div class="detection-panel__scroll">
                <el-form label-position="top" class="inspection-detail-form">
                    <el-form-item v-for="column in inspectionColumns" :key="column.key" :label="column.label">
                        <el-select
                            v-if="!isInspectionImageColumn(column) && column.options?.length"
                            :model-value="getInspectionValue(column)"
                            class="w-full"
                            :disabled="column.calculated"
                            :placeholder="column.calculated ? '自动计算' : `请选择${column.label}`"
                            @update:model-value="setInspectionValue(column, $event)"
                        >
                            <el-option v-for="option in column.options" :key="option" :label="option" :value="option" />
                        </el-select>
                        <el-input
                            v-else
                            :model-value="getInspectionValue(column)"
                            type="textarea"
                            :rows="column.key === 'recycle_address' || column.key === 'sale_address' || column.key === 'remark_info' || column.key === 'inspection_result' ? 5 : 3"
                            :disabled="column.calculated"
                            :placeholder="column.calculated ? '自动计算' : `请输入${column.label}`"
                            @update:model-value="setInspectionValue(column, $event)"
                        />
                        <ChooseImage
                            v-if="isInspectionImageColumn(column)"
                            v-model="inspectionValues[inspectionImageValueKey(column)]"
                            :limit="9"
                            :preview="true"
                        />
                    </el-form-item>
                </el-form>
                </div>
            </section>
            </div>
            <template #footer>
                <el-button :disabled="detectionSubmitting" @click="inspectionVisible = false">取消</el-button>
                <el-button v-if="canPublishSubmission" type="primary" :loading="inspectionSubmitting && inspectionAction === 'inventory'" :disabled="detectionSubmitting" @click="submitInspection('inventory')">加入库存</el-button>
                <el-button v-if="canPublishSubmission" type="success" :loading="inspectionSubmitting && inspectionAction === 'product'" :disabled="detectionSubmitting || Boolean(inspectionCurrentRow?.publishedProductId)" @click="submitInspection('product')">
                    {{ inspectionCurrentRow?.publishedProductId ? '已添加到商品管理' : '商品出售' }}
                </el-button>
            </template>
        </el-dialog>

        <el-dialog v-model="reviewsVisible" title="审核记录" width="720px">
            <el-timeline v-if="reviewList.length">
                <el-timeline-item v-for="item in reviewList" :key="item.id" :timestamp="formatTimestampValue(item.createdAt) || '-'">
                    <div class="font-medium text-gray-800">{{ getReviewActionLabel(item.action) }}</div>
                    <div class="mt-1 text-sm text-gray-500">{{ item.reviewNote || '无备注' }}</div>
                    <div class="mt-1 text-xs text-gray-400">提交账号：{{ item.adminName || item.adminAccount || '-' }}</div>
                </el-timeline-item>
            </el-timeline>
            <el-empty v-else description="暂无审核记录"></el-empty>
            <template #footer>
                <el-button @click="reviewsVisible = false">取消</el-button>
                <el-button type="primary" @click="reviewsVisible = false">保存</el-button>
            </template>
        </el-dialog>

        <el-dialog v-model="reportVisible" title="编辑报告" width="620px">
            <el-form :model="reportForm" label-width="90px">
                <el-form-item label="报告描述">
                    <el-input
                        v-model="reportForm.description"
                        type="textarea"
                        :rows="7"
                        maxlength="5000"
                        show-word-limit
                        placeholder="请填写回收审核报告描述"
                    ></el-input>
                </el-form-item>
            </el-form>
            <template #footer>
                <el-button :disabled="reportSubmitting" @click="reportVisible = false">取消</el-button>
                <el-button type="primary" :loading="reportSubmitting" @click="submitReport">保存</el-button>
            </template>
        </el-dialog>

        <el-dialog v-model="settlementVisible" title="回收打款" width="760px">
            <div v-if="settlementCurrentRow" class="space-y-4">
                <div class="grid grid-cols-2 gap-4 rounded bg-gray-50 p-4 text-sm text-gray-600">
                    <div>商品：{{ settlementCurrentRow.title || '-' }}</div>
                    <div>结款金额：{{ settlementCurrentRow.estimateFinalPrice || 0 }}</div>
                    <div>收款人：{{ settlementCurrentRow.realName || '-' }}</div>
                    <div>收款方式：{{ getPayoutMethodLabel(settlementCurrentRow.payoutMethodLabel) }}</div>
                    <div>提交时间：{{ formatTimestampValue(settlementCurrentRow.createdAt) || '-' }}</div>
                </div>

                <div v-if="isAlipayPayoutMethod(settlementCurrentRow)" class="rounded border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                    支付宝收款需由工作人员线下打款。上传打款证明并确认后，将同步展示给用户；此流程不会调用微信商家转账。
                </div>
                <div v-else class="rounded border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                    网页端仅确认领取资格。审核确认后，用户需要在小程序端主动点击领取，才会唤起微信零钱收款。
                </div>

                <div v-if="currentSettlementBlockedReason" class="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                    {{ currentSettlementBlockedReason }}
                </div>

                <div v-if="isAlipayPayoutMethod(settlementCurrentRow)" class="space-y-3">
                    <div class="text-sm font-medium text-gray-700">打款证明</div>
                    <choose-image v-model="alipayPaymentProofImages" :limit="3"></choose-image>
                    <el-button
                        type="primary"
                        :loading="settlementLoading"
                        :disabled="Boolean(currentSettlementBlockedReason) || !alipayPaymentProofImages.length"
                        @click="handleCompleteAlipaySettlement()"
                    >确认已打款</el-button>
                </div>
                <div v-else class="flex flex-wrap gap-3">
                    <el-button
                        type="primary"
                        :loading="settlementLoading"
                        :disabled="Boolean(currentSettlementBlockedReason)"
                        @click="handleCreateSettlement()"
                    >确认允许领取</el-button>
                    <el-button :loading="settlementLoading" @click="handleSyncSettlement()">同步状态</el-button>
                </div>

                <el-timeline v-if="settlementList.length">
                    <el-timeline-item
                        v-for="item in settlementList"
                        :key="item.id"
                        :timestamp="formatTimestampValue(item.createdAt) || '-'"
                    >
                        <div class="flex items-center gap-2">
                            <span class="font-medium text-gray-800">{{ getSettlementStateLabel(item.state) }}</span>
                            <el-tag size="small" :type="getSettlementTagType(item.state)">{{ item.state }}</el-tag>
                        </div>
                        <div class="mt-1 text-sm text-gray-500">金额：{{ item.amount || 0 }}</div>
                        <div class="mt-1 text-sm text-gray-500">说明：{{ item.stateDesc || item.transferRemark || '-' }}</div>
                        <div v-if="item.paymentProofImages && item.paymentProofImages.length" class="mt-2 flex flex-wrap gap-2">
                            <el-image
                                v-for="imageUrl in item.paymentProofImages"
                                :key="imageUrl"
                                class="rounded border"
                                style="width: 72px; height: 72px"
                                :src="imageUrl"
                                fit="cover"
                                :preview-src-list="item.paymentProofImages"
                            ></el-image>
                        </div>
                        <div class="mt-1 text-xs text-gray-400">单号：{{ item.outBillNo || '-' }}</div>
                    </el-timeline-item>
                </el-timeline>
                <el-empty v-else description="暂无结款记录"></el-empty>
            </div>
            <template #footer>
                <el-button :disabled="settlementLoading" @click="settlementVisible = false">取消</el-button>
                <el-button type="primary" :loading="settlementLoading" :disabled="Boolean(currentSettlementBlockedReason)" @click="saveSettlement">保存</el-button>
            </template>
        </el-dialog>
    </div>
</template>

<script setup>
import { computed } from 'vue'
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import SearchHeader from '~/components/SearchHeader.vue'
import SearchHeaderItem from '~/components/SearchHeaderItem.vue'
import ListHeader from '~/components/ListHeader.vue'
import ChooseImage from '~/components/ChooseImage.vue'
import { hasPermission } from '~/directive/permission'
import { getCategoryList, getCategorySections } from '~/api/category'
import { getInventoryCalculations, getInventoryColumns } from '~/api/inventory'
import {
    deleteRecycleSubmissions,
    createRecycleSubmission,
    getRecycleSubmissionList,
    getRecycleSubmissionReviews,
    getRecycleSubmissionSettlements,
    reviewRecycleSubmission,
    updateRecycleSubmissionInfo,
    updateRecycleSubmissionReport,
    completeRecycleSubmissionInspection,
    createRecycleSubmissionSettlement,
    syncRecycleSubmissionSettlement,
    completeAlipayRecycleSubmissionSettlement,
} from '~/api/recycle'
import { formatTimestampValue, hideFullLoading, hideLoading, showFullLoading, showLoading, toast } from '~/composables/util'

const statusOptions = [
    { label: '用户申请拿回', value: 'user_take_back_requested' },
    { label: '用户接受报价', value: 'user_accepted_quote' },
    { label: '用户已取消', value: 'user_cancelled' },
    { label: '检测中', value: 'submitted' },
    { label: '已打回', value: 'needs_fix' },
    { label: '已通过', value: 'approved' },
]

const searchForm = reactive({
    title: '',
    status: '',
    categoryKey: '',
})

const recycleCategories = ref([])
const currentPage = ref(1)
const pageSize = ref(10)
const total = ref(0)
const tableData = ref([])
const reviewTableRef = ref(null)
const selectedSubmissionRows = ref([])

const incorrectFormRef = ref(null)
const viewVisible = ref(false)
const currentViewRow = ref(null)
const recordEditorVisible = ref(false)
const recordEditorMode = ref('create')
const recordEditorSubmitting = ref(false)
const reviewSubmitting = ref(false)
const inspectionVisible = ref(false)
const inspectionSubmitting = ref(false)
const inspectionAction = ref('')
const inspectionColumns = ref([])
const inspectionCalculations = ref([])
const inspectionCurrentRow = ref(null)
const inspectionValues = reactive({})
const currentSubmissionId = ref(0)
const reviewDecision = ref('')
const detectionSubmitting = computed(() => reviewSubmitting.value || inspectionSubmitting.value)

const reviewsVisible = ref(false)
const reviewList = ref([])
const reportVisible = ref(false)
const reportSubmitting = ref(false)
const reportForm = reactive({
    submissionId: 0,
    description: '',
})
const settlementVisible = ref(false)
const settlementLoading = ref(false)
const settlementCurrentRow = ref(null)
const settlementList = ref([])
const alipayPaymentProofImages = ref([])
const reviewOptionItems = ref([])
const settlementReadyStatuses = ['approved', 'published', 'reviewed']

const recordForm = reactive({
    id: 0,
    title: '',
    categoryKey: '',
    itemSource: '后台手动新增',
    sfWaybillNo: '',
    payoutMethodLabel: '',
    accountNumber: '',
    realName: '',
    optionSummary: '',
    note: '',
    estimateBasePrice: 0,
    estimateFinalPrice: 0,
    submissionImages: [],
})

const incorrectForm = reactive({
    title: '',
    categoryKey: '',
    coverLabel: '',
    coverTheme: 'red',
    accountNumber: '',
    realName: '',
    optionSummary: '',
    selectedDeviceOptionValues: {},
    selectedDeviceOptionTexts: {},
    submissionImages: [],
    note: '',
    estimateBasePrice: 0,
    estimateFinalPrice: 0,
    reviewNote: '',
})

const incorrectRules = {
    reviewNote: [{
        validator: (_rule, value, callback) => {
            if (reviewDecision.value === 'needs_fix' && !String(value || '').trim()) {
                callback(new Error('打回用户时请填写打回原因'))
                return
            }
            callback()
        },
        trigger: 'blur',
    }],
}

const getStatusLabel = (status) => {
    if (status === 'published' || status === 'reviewed') return '已通过'
    const item = statusOptions.find((option) => option.value === status)
    return item ? item.label : status || '未知状态'
}

const getStatusTagType = (status) => {
    if (status === 'published' || status === 'reviewed' || status === 'approved') return 'success'
    if (status === 'needs_fix') return 'danger'
    return 'warning'
}

const getUserResponseLabel = (status) => {
    if (status === 'take_back_requested') return '用户申请拿回'
    if (status === 'accepted_quote') return '用户接受报价'
    return ''
}

const getUserResponseTagType = (status) => status === 'take_back_requested' ? 'warning' : 'success'

const getPayoutMethodLabel = (payoutMethodLabel) => {
    const value = String(payoutMethodLabel || '').trim()
    if (value.includes('微信')) return '微信账号收款'
    if (value.includes('支付宝') || value.toLowerCase() === 'alipay') return '支付宝账号收款'
    return value || '未填写收款方式'
}

const getRecycleCategoryLabel = (categoryKey) => {
    const value = String(categoryKey || '').trim()
    const category = recycleCategories.value.find((item) => String(item.key || '') === value)
    return category?.label || category?.name || value || '-'
}

const formatEstimatePrice = (value) => Number(value || 0).toFixed(2)

const formatCustomerInfo = (value) => String(value || '').replace(/[;；]\s*/g, (separator) => `${separator}\n`)

const formatReturnAddress = (address) => [
    address?.province,
    address?.city,
    address?.district,
    address?.addressDetail,
].map((item) => String(item || '').trim()).filter(Boolean).join(' ')

const buildReviewOptionItems = (selectedDeviceOptionValues = {}, selectedDeviceOptionTexts = {}) => {
    const selectedValues = selectedDeviceOptionValues && typeof selectedDeviceOptionValues === 'object'
        ? selectedDeviceOptionValues
        : {}
    const selectedTexts = selectedDeviceOptionTexts && typeof selectedDeviceOptionTexts === 'object'
        ? selectedDeviceOptionTexts
        : {}
    const optionKeys = Array.from(new Set([...Object.keys(selectedValues), ...Object.keys(selectedTexts)]))

    return optionKeys.map((key) => ({
        key,
        label: key,
        value: String(selectedTexts[key] || selectedValues[key] || '-'),
    }))
}

const isAlipayPayoutMethod = (row) => {
    const payoutMethod = String(row?.payoutMethodLabel || '').trim().toLowerCase()
    return payoutMethod.includes('支付宝') || payoutMethod === 'alipay'
}

const getReviewActionLabel = (action) => {
    if (action === 'publish') return '信息无误并上架'
    if (action === 'approved') return '信息无误并保存'
    if (action === 'incorrect') return '打回用户'
    if (action === 'report') return '编辑报告'
    if (action === 'user_accepted') return '用户接受最终报价'
    if (action === 'user_take_back') return '用户选择拿回产品'
    if (action === 'user_cancelled') return '用户已取消寄件'
    if (action === 'inventory_create') return '加入库存'
    if (action === 'inventory_update') return '更新库存检测信息'
    if (action === 'inspection') return '添加到商品管理'
    return '修改记录'
}

const getSettlementStateLabel = (state) => {
    if (state === 'ADMIN_CONFIRMED') return '待领取'
    if (state === 'PENDING' || state === 'ACCEPTED' || state === 'PROCESSING') return '处理中'
    if (state === 'WAIT_USER_CONFIRM') return '待收款'
    if (state === 'TRANSFERING') return '转账中'
    if (state === 'SUCCESS') return '已完成'
    if (state === 'FAIL') return '失败'
    if (state === 'CANCEL') return '已取消'
    if (state === 'CANCELLED') return '已取消'
    if (state === 'CANCELING') return '取消中'
    return state || '未发起'
}

const getSettlementTagType = (state) => {
    if (state === 'SUCCESS') return 'success'
    if (state === 'FAIL' || state === 'CANCEL' || state === 'CANCELLED') return 'danger'
    if (state === 'ADMIN_CONFIRMED' || state === 'WAIT_USER_CONFIRM') return 'warning'
    if (state === 'PENDING' || state === 'ACCEPTED' || state === 'PROCESSING' || state === 'TRANSFERING' || state === 'CANCELING') return 'primary'
    return 'info'
}

const getCreateSettlementBlockedReason = (row) => {
    if (!row) {
        return '未找到回收单'
    }

    if (row.userStatus === 'cancelled') {
        return '用户已取消该回收单，不能进行打款前确认'
    }

    if (!settlementReadyStatuses.includes(String(row.status || ''))) {
        return '请先在“检测商品”中标记为信息无误并保存，再确认允许领取'
    }

    if (Number(row.estimateFinalPrice || 0) <= 0) {
        return '当前结款金额必须大于 0，请先填写最终估价'
    }

    if (String(row.payoutMethodLabel || '').trim() !== '微信零钱') {
        return '只有选择微信零钱收款的回收单需要确认领取资格'
    }

    const settlementState = String(row.settlement?.state || '').toUpperCase()
    if (settlementState === 'SUCCESS') {
        return '该回收单已打款完成，无需重复确认'
    }

    if (settlementState === 'ADMIN_CONFIRMED') {
        return '管理员已完成打款前确认，待用户在小程序端领取'
    }

    if (['PENDING', 'ACCEPTED', 'PROCESSING', 'WAIT_USER_CONFIRM', 'TRANSFERING', 'CANCELING'].includes(settlementState)) {
        return '该回收单已进入用户领取流程，请先同步状态'
    }

    return ''
}

const getAlipaySettlementBlockedReason = (row) => {
    if (!row) return '未找到回收单'
    if (row.userStatus === 'cancelled') return '用户已取消该回收单，不能确认打款'
    if (!settlementReadyStatuses.includes(String(row.status || ''))) return '请先在“检测商品”中标记为信息无误并保存，再确认打款'
    if (Number(row.estimateFinalPrice || 0) <= 0) return '当前结款金额必须大于 0，请先填写最终估价'
    if (String(row.settlement?.state || '').toUpperCase() === 'SUCCESS') return '该回收单已打款完成，无需重复确认'
    return ''
}

const currentSettlementBlockedReason = computed(() => isAlipayPayoutMethod(settlementCurrentRow.value)
    ? getAlipaySettlementBlockedReason(settlementCurrentRow.value)
    : getCreateSettlementBlockedReason(settlementCurrentRow.value))
const canReviewSubmission = hasPermission(['reviewRecycleSubmission,POST'])
const canCreateRecycleSubmission = hasPermission(['createRecycleSubmission,POST'])
const canUpdateRecycleSubmissionInfo = hasPermission(['updateRecycleSubmissionInfo,POST'])
const canViewWaybillNo = hasPermission(['getRecycleSubmissionWaybillNo,GET'])
const canEditReport = hasPermission(['updateRecycleSubmissionReport,POST'])
const canPublishSubmission = hasPermission(['publishRecycleSubmission,POST'])
const canSettleSubmission = hasPermission(['createRecycleSubmissionSettlement,POST']) || hasPermission(['syncRecycleSubmissionSettlement,POST'])
const canManualAlipaySettleSubmission = hasPermission(['completeAlipayRecycleSubmissionSettlement,POST'])
const selectedSubmissionIds = computed(() =>
    selectedSubmissionRows.value
        .map((item) => Number(item?.id || 0))
        .filter((item) => item > 0)
)

const syncCurrentViewRow = (row) => {
    if (!row) return
    currentViewRow.value = {
        ...(currentViewRow.value || {}),
        ...row,
        settlement: row.settlement ?? currentViewRow.value?.settlement ?? null,
    }
}

const fillRecordForm = (row = null) => {
    recordForm.id = Number(row?.id || 0)
    recordForm.title = String(row?.title || '')
    recordForm.categoryKey = String(row?.categoryKey || '')
    recordForm.itemSource = String(row?.itemSource || (row ? '微信小程序' : '后台手动新增'))
    recordForm.sfWaybillNo = String(row?.sfWaybillNo || '')
    recordForm.payoutMethodLabel = String(row?.payoutMethodLabel || '')
    recordForm.accountNumber = String(row?.accountNumber || '')
    recordForm.realName = String(row?.realName || '')
    recordForm.optionSummary = String(row?.optionSummary || '')
    recordForm.note = String(row?.note || '')
    recordForm.estimateBasePrice = Number(row?.estimateBasePrice || 0)
    recordForm.estimateFinalPrice = Number(row?.estimateFinalPrice || 0)
    recordForm.submissionImages = Array.isArray(row?.submissionImages) ? [...row.submissionImages] : []
}

const handleOpenView = (row) => {
    currentViewRow.value = { ...row }
    viewVisible.value = true
}

const saveView = () => {
    getData(currentPage.value)
    viewVisible.value = false
}

const handleOpenManualCreate = () => {
    recordEditorMode.value = 'create'
    fillRecordForm()
    recordEditorVisible.value = true
}

const handleOpenInfoEditor = (row) => {
    recordEditorMode.value = 'edit'
    fillRecordForm(row)
    recordEditorVisible.value = true
}

const saveRecordEditor = () => {
    const title = String(recordForm.title || '').trim()
    if (!title) {
        toast('请填写商品名称', 'warning')
        return
    }
    const itemSource = String(recordForm.itemSource || '').trim()
    if (!itemSource) {
        toast('请填写物品来源', 'warning')
        return
    }

    const payload = {
        title,
        categoryKey: recordForm.categoryKey,
        itemSource,
        sfWaybillNo: recordForm.sfWaybillNo,
        payoutMethodLabel: recordForm.payoutMethodLabel,
        accountNumber: recordForm.accountNumber,
        realName: recordForm.realName,
        optionSummary: recordForm.optionSummary,
        estimateBasePrice: recordForm.estimateBasePrice,
        estimateFinalPrice: recordForm.estimateFinalPrice,
        submissionImages: recordForm.submissionImages,
    }
    recordEditorSubmitting.value = true
    const request = recordEditorMode.value === 'create'
        ? createRecycleSubmission(payload)
        : updateRecycleSubmissionInfo(recordForm.id, payload)
    request
        .then((data) => {
            syncCurrentViewRow(data)
            recordEditorVisible.value = false
            viewVisible.value = true
            toast(recordEditorMode.value === 'create' ? '回收记录已新增' : '回收信息已保存')
            getData(currentPage.value)
        })
        .finally(() => {
            recordEditorSubmitting.value = false
        })
}

const resetSearch = () => {
    searchForm.title = ''
    searchForm.status = ''
    searchForm.categoryKey = ''
    getData(1)
}

const getData = (page = currentPage.value) => {
    currentPage.value = Number(page || 1)
    showLoading('#recycle-review-table')
    return getRecycleSubmissionList(currentPage.value, {
        ...searchForm,
        limit: pageSize.value,
    })
        .then((res) => {
            total.value = Number(res.totalCount || 0)
            tableData.value = Array.isArray(res.list) ? res.list : []
            if (reviewTableRef.value) {
                reviewTableRef.value.clearSelection()
            }
            selectedSubmissionRows.value = []
        })
        .finally(() => hideLoading())
}

const handleSelectionChange = (rows) => {
    selectedSubmissionRows.value = Array.isArray(rows) ? rows : []
}

const fillIncorrectForm = (row) => {
    incorrectForm.title = row.title || ''
    incorrectForm.categoryKey = row.categoryKey || ''
    incorrectForm.coverLabel = row.coverLabel || ''
    incorrectForm.coverTheme = row.coverTheme || 'red'
    incorrectForm.accountNumber = row.accountNumber || ''
    incorrectForm.realName = row.realName || ''
    incorrectForm.optionSummary = row.optionSummary || ''
    incorrectForm.selectedDeviceOptionValues = { ...(row.selectedDeviceOptionValues || {}) }
    incorrectForm.selectedDeviceOptionTexts = { ...(row.selectedDeviceOptionTexts || {}) }
    reviewOptionItems.value = buildReviewOptionItems(
        incorrectForm.selectedDeviceOptionValues,
        incorrectForm.selectedDeviceOptionTexts,
    )
    incorrectForm.submissionImages = Array.isArray(row.submissionImages) ? [...row.submissionImages] : []
    incorrectForm.note = row.note || ''
    incorrectForm.estimateBasePrice = Number(row.estimateBasePrice || 0)
    incorrectForm.estimateFinalPrice = Number(row.estimateFinalPrice || 0)
    incorrectForm.reviewNote = row.reviewNote || ''
    reviewDecision.value = ['approved', 'published', 'reviewed'].includes(String(row.status || '')) ? 'approved' : ''
    incorrectFormRef.value && incorrectFormRef.value.clearValidate()
}

const isInspectionImageColumn = (column) => String(column?.fieldType || column?.field_type || '').toLowerCase() === 'image'
const inspectionImageValueKey = (column) => `${String(column?.key || '')}__images`

const parseInspectionMoney = (value) => {
    const normalized = String(value === null || value === undefined ? '' : value)
        .replace(/,/g, '')
        .replace(/[^0-9.+-]/g, '')
    const result = Number(normalized)
    return Number.isFinite(result) ? result : 0
}

const inspectionDisplayValues = computed(() => {
    const values = { ...inspectionValues }
    inspectionCalculations.value.forEach((rule) => {
        const expression = Array.isArray(rule.expression) ? rule.expression : []
        if (!expression.length) return
        const parts = [parseInspectionMoney(values[expression[0]?.value])]
        const lowPrecedenceOperators = []
        for (let index = 1; index < expression.length; index += 2) {
            const operator = expression[index]?.value
            const nextValue = parseInspectionMoney(values[expression[index + 1]?.value])
            if (operator === '*' || operator === '/') {
                const previousValue = parts.pop()
                parts.push(operator === '/' && nextValue === 0 ? 0 : operator === '*' ? previousValue * nextValue : previousValue / nextValue)
            } else {
                lowPrecedenceOperators.push(operator)
                parts.push(nextValue)
            }
        }
        let result = parts[0] || 0
        lowPrecedenceOperators.forEach((operator, index) => {
            const nextValue = parts[index + 1] || 0
            result = operator === '+' ? result + nextValue : result - nextValue
        })
        values[rule.targetColumnKey] = Number.isFinite(result) ? result.toFixed(2) : '0.00'
    })
    return values
})

const getInspectionValue = (column) => inspectionDisplayValues.value[String(column?.key || '')] ?? ''

const setInspectionValue = (column, value) => {
    if (!column?.calculated) inspectionValues[String(column.key || '')] = value
}

const fillInspectionValues = (row) => {
    Object.keys(inspectionValues).forEach((key) => delete inspectionValues[key])
    const savedValues = row?.inventoryValues && typeof row.inventoryValues === 'object' ? row.inventoryValues : {}
    inspectionColumns.value.forEach((column) => {
        const key = String(column.key || '')
        const imageKey = inspectionImageValueKey(column)
        inspectionValues[key] = savedValues[key] ?? ''
        if (isInspectionImageColumn(column)) inspectionValues[imageKey] = Array.isArray(savedValues[imageKey]) ? [...savedValues[imageKey]] : []
        if (key === 'recycle_id' || String(column.label || '').includes('回收订单编号') || String(column.label || '').includes('回收ID')) {
            inspectionValues[key] = String(row.orderNo || '')
        } else if (key === 'sf_express_number') {
            inspectionValues[key] = String(row.sfWaybillNo || '')
        } else if (key === 'communication_price') {
            inspectionValues[key] = String(row.estimateFinalPrice || row.estimateBasePrice || '')
        } else if (key === 'remark_info') {
            inspectionValues[key] = String(row.note || '')
        }
    })
}

const reloadInspectionConfiguration = async () => {
    const [configuredColumns, configuredCalculations] = await Promise.all([
        getInventoryColumns(),
        getInventoryCalculations().catch(() => []),
    ])
    inspectionColumns.value = Array.isArray(configuredColumns) ? configuredColumns : []
    inspectionCalculations.value = Array.isArray(configuredCalculations) ? configuredCalculations : []
}

const handleInventoryConfigurationUpdate = (event) => {
    if (!inspectionVisible.value || !['column-settings', 'column-options', 'calculation'].includes(event?.detail?.action)) return
    reloadInspectionConfiguration().catch(() => toast('库存字段同步失败，请稍后重试', 'warning'))
}

const setReviewDecision = (value) => {
    reviewDecision.value = value
    incorrectFormRef.value && incorrectFormRef.value.validateField('reviewNote', () => {})
}

const handleOpenDetection = async (row) => {
    if (row.userStatus === 'cancelled') {
        toast('用户已取消的回收单不能继续检测', 'warning')
        return
    }
    currentSubmissionId.value = row.id
    inspectionCurrentRow.value = { ...row }
    fillIncorrectForm(row)
    try {
        await reloadInspectionConfiguration()
        fillInspectionValues(row)
        inspectionVisible.value = true
    } catch (error) {
        toast('库存字段加载失败，请稍后重试', 'error')
    }
}

const handleOpenReviews = (row) => {
    reviewsVisible.value = true
    reviewList.value = []
    getRecycleSubmissionReviews(row.id).then((res) => {
        reviewList.value = Array.isArray(res) ? res : []
    })
}

const handleOpenReport = (row) => {
    reportForm.submissionId = Number(row?.id || 0)
    reportForm.description = String(row?.reportDescription || '')
    reportVisible.value = true
}

const submitReport = () => {
    const submissionId = Number(reportForm.submissionId || 0)
    const description = String(reportForm.description || '').trim()
    if (!submissionId) {
        toast('未找到回收审核记录', 'warning')
        return
    }
    if (!description) {
        toast('请填写报告描述', 'warning')
        return
    }

    reportSubmitting.value = true
    updateRecycleSubmissionReport(submissionId, { description })
        .then(() => {
            toast('报告提交成功')
            reportVisible.value = false
            syncCurrentViewRow({ reportDescription: description })
            getData(currentPage.value)
            if (reviewsVisible.value) {
                getRecycleSubmissionReviews(submissionId).then((res) => {
                    reviewList.value = Array.isArray(res) ? res : []
                })
            }
        })
        .finally(() => {
            reportSubmitting.value = false
        })
}

const handleDeleteSubmissions = () => {
    if (!selectedSubmissionIds.value.length) {
        toast('请先选择要删除的回收审核记录', 'warning')
        return
    }

    const deletedCount = selectedSubmissionIds.value.length

    showFullLoading()
    deleteRecycleSubmissions(selectedSubmissionIds.value)
        .then(() => {
            toast('回收审核记录已删除')
            if (reviewTableRef.value) {
                reviewTableRef.value.clearSelection()
            }
            selectedSubmissionRows.value = []
            const nextPage = tableData.value.length === deletedCount && currentPage.value > 1
                ? currentPage.value - 1
                : currentPage.value
            getData(nextPage)
        })
        .finally(() => {
            hideFullLoading()
        })
}

const loadSettlementList = (submissionId) => {
    settlementLoading.value = true
    return getRecycleSubmissionSettlements(submissionId)
        .then((res) => {
            const nextList = Array.isArray(res) ? res : []
            settlementList.value = nextList

            const latestSettlement = nextList[0] || null
            const targetIndex = tableData.value.findIndex((item) => Number(item.id || 0) === Number(submissionId || 0))
            if (targetIndex !== -1) {
                tableData.value[targetIndex] = {
                    ...tableData.value[targetIndex],
                    settlement: latestSettlement,
                }
            }

            if (settlementCurrentRow.value && Number(settlementCurrentRow.value.id || 0) === Number(submissionId || 0)) {
                settlementCurrentRow.value = {
                    ...settlementCurrentRow.value,
                    settlement: latestSettlement,
                }
                syncCurrentViewRow({ settlement: latestSettlement })
            }
        })
        .finally(() => {
            settlementLoading.value = false
        })
}

const handleOpenSettlement = (row) => {
    settlementCurrentRow.value = row
    settlementVisible.value = true
    settlementList.value = []
    alipayPaymentProofImages.value = []
    loadSettlementList(row.id)
}

const saveSettlement = () => {
    if (isAlipayPayoutMethod(settlementCurrentRow.value)) {
        handleCompleteAlipaySettlement()
        return
    }
    handleCreateSettlement()
}

const handleCreateSettlement = (row) => {
    const targetRow = row || settlementCurrentRow.value
    if (!targetRow) return

    const blockedReason = getCreateSettlementBlockedReason(targetRow)
    if (blockedReason) {
        toast(blockedReason, 'warning')
        return
    }

    ElMessageBox.confirm(
        '网页端仅确认领取资格。确认后，用户需要在小程序端主动点击领取，系统才会唤起微信零钱收款。',
        '确认允许领取',
        {
            confirmButtonText: '确认',
            cancelButtonText: '取消',
            type: 'warning',
        }
    )
        .then(() => {
            settlementLoading.value = true
            return createRecycleSubmissionSettlement(targetRow.id)
                .then(() => {
                    toast('已确认领取资格，用户可在小程序端发起微信零钱收款')
                    getData(currentPage.value)
                    return loadSettlementList(targetRow.id)
                })
                .finally(() => {
                    settlementLoading.value = false
                })
        })
        .catch(() => {})
}

const handleSyncSettlement = (row) => {
    const targetRow = row || settlementCurrentRow.value
    if (!targetRow) return

    settlementLoading.value = true
    syncRecycleSubmissionSettlement(targetRow.id)
        .then(() => {
            toast('结款状态已同步')
            getData(currentPage.value)
            return loadSettlementList(targetRow.id)
        })
        .finally(() => {
            settlementLoading.value = false
        })
}

const handleCompleteAlipaySettlement = () => {
    const targetRow = settlementCurrentRow.value
    if (!targetRow) return

    const blockedReason = getAlipaySettlementBlockedReason(targetRow)
    if (blockedReason) {
        toast(blockedReason, 'warning')
        return
    }

    if (!alipayPaymentProofImages.value.length) {
        toast('请先上传至少一张打款证明图片', 'warning')
        return
    }

    ElMessageBox.confirm(
        '确认后会向用户同步支付宝打款完成状态和打款证明，且不会调用微信商家转账。',
        '确认已打款',
        {
            confirmButtonText: '确认',
            cancelButtonText: '取消',
            type: 'warning',
        }
    )
        .then(() => {
            settlementLoading.value = true
            return completeAlipayRecycleSubmissionSettlement(targetRow.id, {
                paymentProofImages: alipayPaymentProofImages.value,
            })
                .then(() => {
                    toast('支付宝打款证明已同步给用户')
                    getData(currentPage.value)
                    return loadSettlementList(targetRow.id)
                })
                .finally(() => {
                    settlementLoading.value = false
                })
        })
        .catch(() => {})
}

const submitIncorrectForm = (decision = reviewDecision.value) => {
    if (!decision) {
        toast('请先选择审核标记', 'warning')
        return
    }

    reviewDecision.value = decision

    incorrectFormRef.value.validate((valid) => {
        if (!valid) return false

        reviewSubmitting.value = true
        reviewRecycleSubmission(currentSubmissionId.value, {
            title: incorrectForm.title,
            categoryKey: incorrectForm.categoryKey,
            coverLabel: incorrectForm.coverLabel,
            coverTheme: incorrectForm.coverTheme,
            accountNumber: incorrectForm.accountNumber,
            realName: incorrectForm.realName,
            optionSummary: incorrectForm.optionSummary,
            selectedDeviceOptionValues: incorrectForm.selectedDeviceOptionValues,
            selectedDeviceOptionTexts: incorrectForm.selectedDeviceOptionTexts,
            submissionImages: incorrectForm.submissionImages,
            note: incorrectForm.note,
            estimateBasePrice: incorrectForm.estimateBasePrice,
            estimateFinalPrice: incorrectForm.estimateFinalPrice,
            status: decision,
            reviewNote: incorrectForm.reviewNote,
        })
            .then((data) => {
                toast('审核标记已保存')
                syncCurrentViewRow(data)
                inspectionCurrentRow.value = { ...(inspectionCurrentRow.value || {}), ...(data || {}) }
                getData(currentPage.value)
            })
            .finally(() => {
                reviewSubmitting.value = false
            })
    })
}

const submitInspection = (action) => {
    const submissionId = Number(inspectionCurrentRow.value?.id || 0)
    if (!submissionId) {
        toast('未找到回收单', 'warning')
        return
    }

    if (reviewDecision.value !== 'approved') {
        toast('请先将用户填写记录标记为“信息无误”', 'warning')
        return
    }
    if (action === 'product' && inspectionCurrentRow.value?.publishedProductId) {
        toast('该回收商品已经添加到商品管理', 'warning')
        return
    }

    inspectionSubmitting.value = true
    inspectionAction.value = action
    const ensureApproved = ['published', 'reviewed'].includes(String(inspectionCurrentRow.value?.status || ''))
        ? Promise.resolve(inspectionCurrentRow.value)
        : reviewRecycleSubmission(submissionId, {
            title: incorrectForm.title,
            categoryKey: incorrectForm.categoryKey,
            coverLabel: incorrectForm.coverLabel,
            coverTheme: incorrectForm.coverTheme,
            accountNumber: incorrectForm.accountNumber,
            realName: incorrectForm.realName,
            optionSummary: incorrectForm.optionSummary,
            selectedDeviceOptionValues: incorrectForm.selectedDeviceOptionValues,
            selectedDeviceOptionTexts: incorrectForm.selectedDeviceOptionTexts,
            submissionImages: incorrectForm.submissionImages,
            note: incorrectForm.note,
            estimateBasePrice: incorrectForm.estimateBasePrice,
            estimateFinalPrice: incorrectForm.estimateFinalPrice,
            status: 'approved',
            reviewNote: incorrectForm.reviewNote,
        })

    ensureApproved
        .then((approvedRow) => {
            inspectionCurrentRow.value = { ...(inspectionCurrentRow.value || {}), ...(approvedRow || {}) }
            return completeRecycleSubmissionInspection(submissionId, {
                action,
                inventoryValues: inspectionValues,
            })
        })
        .then((result) => {
            const inventoryUpdated = Boolean(result?.inventoryUpdated)
            toast(action === 'inventory'
                ? (inventoryUpdated ? '库存检测信息已更新' : '商品已加入库存管理')
                : '商品已添加到商品管理')
            window.dispatchEvent(new CustomEvent('inventory-management-updated', {
                detail: { action: action === 'inventory' ? (inventoryUpdated ? 'inspection-update' : 'inspection-create') : 'product-create', source: 'recycle-inspection' },
            }))
            syncCurrentViewRow(result?.submission)
            inspectionCurrentRow.value = { ...(inspectionCurrentRow.value || {}), ...(result?.submission || {}) }
            getData(currentPage.value)
        })
        .finally(() => {
            inspectionSubmitting.value = false
            inspectionAction.value = ''
        })
}

onMounted(() => {
    window.addEventListener('inventory-management-updated', handleInventoryConfigurationUpdate)
    showFullLoading()
    Promise.all([
        Promise.all([
            getCategoryList('recycle', true, '', 0, 0),
            getCategorySections(true),
        ]).then(([categoryResponse, sectionResponse]) => {
            const categories = Array.isArray(categoryResponse)
                ? categoryResponse
                : (Array.isArray(categoryResponse?.list) ? categoryResponse.list : [])
            const sections = Array.isArray(sectionResponse) ? sectionResponse : []
            const sectionNames = new Map(sections.map((section) => [
                String(section.key || ''),
                String(section.name || '').trim(),
            ]))
            recycleCategories.value = categories.map((item) => ({
                ...item,
                label: `${sectionNames.get(String(item.sectionKey || '')) || '未分类'} / ${String(item.name || '').trim()}`,
            }))
        }),
    ]).finally(() => {
        hideFullLoading()
        getData(1)
    })
})

onBeforeUnmount(() => {
    window.removeEventListener('inventory-management-updated', handleInventoryConfigurationUpdate)
})
</script>

<style scoped>
.detection-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 16px;
    height: min(68vh, 760px);
    min-height: 440px;
}

.detection-panel {
    display: flex;
    min-width: 0;
    min-height: 0;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    background: #fff;
}

.detection-panel__title {
    flex-shrink: 0;
    padding: 12px 16px;
    border-bottom: 1px solid #e5e7eb;
    background: #f8fafc;
    color: #1f2937;
    font-size: 15px;
    font-weight: 600;
}

.detection-panel__scroll {
    min-height: 0;
    flex: 1;
    overflow-y: auto;
    padding: 16px;
}

.detection-review-actions {
    position: sticky;
    bottom: -16px;
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin: 8px -16px -16px;
    padding: 12px 16px;
    border-top: 1px solid #e5e7eb;
    background: #fff;
}

.inspection-detail-form {
    padding-right: 4px;
}

.recycle-view-content {
    max-height: 68vh;
    overflow-y: auto;
    padding: 4px 6px 4px 0;
}

.recycle-view-summary {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 16px;
}

.recycle-view-title {
    color: #1f2937;
    font-size: 18px;
    font-weight: 600;
}

.recycle-view-order {
    margin-top: 4px;
    color: #9ca3af;
    font-size: 13px;
}

.recycle-view-details {
    margin-bottom: 20px;
}

.recycle-view-section {
    margin-top: 18px;
}

.recycle-view-section__title {
    margin-bottom: 10px;
    color: #374151;
    font-size: 14px;
    font-weight: 600;
}

.recycle-view-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
}

.recycle-record-form {
    max-height: 62vh;
    overflow-y: auto;
    padding-right: 8px;
}

.recycle-form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: 20px;
}

.cover-chip {
    width: 52px;
    height: 52px;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    flex-shrink: 0;
}

.cover-chip-red {
    background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%);
}

.cover-chip-blue {
    background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
}

.cover-chip-gray {
    background: linear-gradient(135deg, #94a3b8 0%, #64748b 100%);
}

.cover-chip-green {
    background: linear-gradient(135deg, #22c55e 0%, #15803d 100%);
}

.cover-image {
    width: 52px;
    height: 52px;
    border-radius: 14px;
    overflow: hidden;
    flex-shrink: 0;
    border: 1px solid #e5e7eb;
}

.customer-images-box {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    min-height: 96px;
    padding: 10px;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    background: #f8fafc;
}

.customer-images-box--empty {
    width: 116px;
    height: 116px;
    min-height: 116px;
    box-sizing: border-box;
    padding: 0;
    align-items: center;
    justify-content: center;
    color: #9ca3af;
    font-size: 14px;
}

.customer-image {
    width: 88px;
    height: 88px;
    border: 1px solid #e5e7eb;
    border-radius: 4px;
}

.review-actions {
    position: sticky;
    bottom: 0;
    margin-top: 20px;
    padding: 16px 0 4px;
    background: #fff;
    border-top: 1px solid #f1f5f9;
}

.review-actions__buttons {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
}

.review-option-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 12px;
    width: 100%;
}

.review-option-item {
    display: flex;
    flex-direction: column;
    min-width: 0;
    padding: 10px 12px;
    border: 1px solid #dbe3ef;
    border-radius: 4px;
    background: #f8fafc;
}

.review-option-item__label {
    color: #64748b;
    font-size: 12px;
    line-height: 1.4;
}

.review-option-item__value {
    margin-top: 4px;
    color: #1f2937;
    font-size: 14px;
    font-weight: 600;
    line-height: 1.4;
}

@media (max-width: 900px) {
    .detection-layout {
        grid-template-columns: 1fr;
        height: auto;
        max-height: 72vh;
        overflow-y: auto;
    }

    .detection-panel {
        min-height: 420px;
    }
}
</style>
