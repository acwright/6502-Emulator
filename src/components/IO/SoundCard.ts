import { IO, IODescription } from '../IO'

export class SoundCard implements IO {

  static DESCRIPTION: IODescription = { className: 'SoundCard', title: 'Sound Card' }

  raiseIRQ = () => {}
  raiseNMI = () => {}

  read(address: number): number { return 0 }
  write(address: number, data: number): void {}
  tick(): void {}
  reset(): void {}
  
  description(): IODescription {
    return SoundCard.DESCRIPTION
  }

}