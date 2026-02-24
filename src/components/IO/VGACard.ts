import { IO, IODescription } from '../IO'
import { VideoCard } from './VideoCard'

export class VGACard extends VideoCard implements IO {

  static DESCRIPTION: IODescription = { className: 'VGACard', title: 'VGA Card' }

}