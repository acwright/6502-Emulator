import { IO, IODescription } from '../IO'

export class SerialCard implements IO {

  static DESCRIPTION: IODescription = { className: 'SerialCard', title: 'Serial Card' }

  raiseIRQ = () => {}
  raiseNMI = () => {}

  read(address: number): number { return 0 }
  write(address: number, data: number): void {}
  tick(): void {}
  reset(): void {}
  
  description(): IODescription {
    return SerialCard.DESCRIPTION
  }

}