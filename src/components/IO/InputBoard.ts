import { v4 as uuidv4 } from 'uuid'
import { IO, IODescription } from '../IO'

export class InputBoard implements IO {

  static DESCRIPTION: IODescription = { className: 'InputBoard', title: 'Input Board' }

  id: string = uuidv4()

  raiseIRQ = () => {}
  raiseNMI = () => {}

  read(address: number): number { return 0 }
  write(address: number, data: number): void {}
  tick(): void {}
  reset(): void {}
  
  description(): IODescription {
    return InputBoard.DESCRIPTION
  }

}