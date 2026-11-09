import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
    BarChart,
    GridComponent,
    CanvasRenderer,
])

export default echarts
