import { IO, IODescription } from '../IO'

export class Empty implements IO {

  static DESCRIPTION: IODescription = { className: 'Empty', title: 'Empty' }

  raiseIRQ = () => {}
  raiseNMI = () => {}

  read(address: number): number { return 0 }
  write(address: number, data: number): void {}
  tick(): void {}
  reset(): void {}
 
  description(): IODescription {
    return Empty.DESCRIPTION
  }

}