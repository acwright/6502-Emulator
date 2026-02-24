import { IO } from '../IO'

export class VideoCard implements IO {

  raiseIRQ = () => {}
  raiseNMI = () => {}

  buffer: Buffer = Buffer.alloc(320 * 240 * 4) // 256x256 pixels, RGBA format

  read(address: number): number { return 0 }
  write(address: number, data: number): void {}
  tick(frequency: number): void {}
  reset(coldStart: boolean): void {}

}