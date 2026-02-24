import { IO, IODescription } from '../IO'

export class VideoCard implements IO {

  static DESCRIPTION: IODescription = { className: 'VideoCard', title: 'Video Card' }

  raiseIRQ = () => {}
  raiseNMI = () => {}

  read(address: number): number { return 0 }
  write(address: number, data: number): void {}
  tick(): void {}
  reset(): void {}
  
  description(): IODescription {
    return VideoCard.DESCRIPTION
  }

}