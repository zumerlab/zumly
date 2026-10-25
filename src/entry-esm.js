import {Zumly} from './zumly.js'
import {ZumlyRouter} from './plugins/router.js'

Zumly.Router = ZumlyRouter

export { Zumly, ZumlyRouter }
export { animeDriver, gsapDriver, motionDriver } from './drivers/index.js'
export default Zumly
