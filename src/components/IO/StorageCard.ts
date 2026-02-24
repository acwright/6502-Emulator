import { IO, IODescription } from '../IO'

export class StorageCard implements IO {

  static DESCRIPTION: IODescription = { className: 'StorageCard', title: 'Storage Card' }

  raiseIRQ = () => {}
  raiseNMI = () => {}

  read(address: number): number { return 0 }
  write(address: number, data: number): void {}
  tick(): void {}
  reset(): void {}
  
  description(): IODescription {
    return StorageCard.DESCRIPTION
  }

}