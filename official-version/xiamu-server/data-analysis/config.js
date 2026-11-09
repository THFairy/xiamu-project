// 用途：集中定义数据分析模块的后台菜单、员工访问路径和权限规则。
const dataAnalysisMenu = {
  name: '数据分析',
  icon: 'data-analysis',
  frontpath: '/data-analysis',
};

const dataAnalysisRules = [
  'getStatistics1,GET',
  'getStatistics3,GET',
  'getAddressLocationStatistics,GET',
  'getOrderTimeStatistics,GET',
  'getUserEngagementStatistics,GET',
  'getUserActivityStatistics,GET',
];

module.exports = {
  dataAnalysisMenu,
  dataAnalysisRules,
  dataAnalysisStaffAccessPath: dataAnalysisMenu.frontpath,
};
