// 用途：集中管理数据分析页面使用的后台统计接口。
import {
    getAddressLocationStatistics,
    getOrderTimeStatistics,
    getStatistics1,
} from '~/api/index.js'

export const getDataAnalysisTutorialStatistics = getStatistics1
export const getDataAnalysisAddressStatistics = getAddressLocationStatistics
export const getDataAnalysisOrderStatistics = getOrderTimeStatistics
