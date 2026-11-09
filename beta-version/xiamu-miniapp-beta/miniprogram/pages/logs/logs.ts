import { formatTime } from '../../utils/util'

interface LogItem {
  date: string
  timeStamp: number
}

interface LogsData {
  logs: LogItem[]
}

interface LogsPage {
  onLoad(): void
}

Page<LogsData, LogsPage>({
  data: {
    logs: [],
  },

  onLoad() {
    const logs = (wx.getStorageSync('logs') || []) as number[]
    this.setData({
      logs: logs.map((log) => ({
        date: formatTime(new Date(log)),
        timeStamp: log,
      })),
    })
  },
})
