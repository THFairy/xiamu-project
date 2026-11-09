// 用途：集中处理数据分析页面所需的后台统计接口响应。
const handleDataAnalysisRequest = async ({
  request,
  requestUrl,
  sendSuccess,
  sendError,
  getDashboardStatistics1,
  getDashboardStatistics3,
  getDashboardAddressLocationStatistics,
  getDashboardOrderTimeStatistics,
  getDashboardUserEngagementStatistics,
  getDashboardUserActivityStatistics,
}) => {
  if (request.method !== 'GET') {
    return false;
  }

  const handlers = {
    '/admin/statistics1': () => getDashboardStatistics1(),
    '/admin/statistics3': () => getDashboardStatistics3(requestUrl.searchParams.get('type') || 'week'),
    '/admin/address-location-statistics': () => getDashboardAddressLocationStatistics(),
    '/admin/order-time-statistics': () => getDashboardOrderTimeStatistics(),
    '/admin/user-engagement-statistics': () => getDashboardUserEngagementStatistics(requestUrl.searchParams.get('type') || 'week'),
    '/admin/user-activity-statistics': () => getDashboardUserActivityStatistics(requestUrl.searchParams.get('type') || 'week'),
  };
  const handler = handlers[requestUrl.pathname];
  if (!handler) {
    return false;
  }

  try {
    sendSuccess(await handler());
  } catch (error) {
    sendError(500, error && error.message ? error.message : String(error));
  }
  return true;
};

module.exports = { handleDataAnalysisRequest };
