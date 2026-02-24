import { IO, IODescription } from '../IO'

export class GPIOCard implements IO {

  static DESCRIPTION: IODescription = { className: 'GPIOCard', title: 'GPIO Card' }

  raiseIRQ = () => {}
  raiseNMI = () => {}

  read(address: number): number { return 0 }
  write(address: number, data: number): void {}
  tick(): void {}
  reset(): void {}
  
  description(): IODescription {
    return GPIOCard.DESCRIPTION
  }

}