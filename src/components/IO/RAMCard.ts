import { IO } from '../IO'

export class RAMCard implements IO {

  static TOTAL_SIZE: number = 256 * 1024 // 256k bytes
  static BANK_SIZE: number = 1024 // 1k per bank
  static NUM_BANKS: number = RAMCard.TOTAL_SIZE / RAMCard.BANK_SIZE // 256 banks
  static BANK_CONTROL_REGISTER: number = 0x3FF // Last byte in 1k window

  data: number[] = [...Array(RAMCard.TOTAL_SIZE)].fill(0x00)
  currentBank: number = 0

  raiseIRQ = () => {}
  raiseNMI = () => {}

  read(address: number): number {
    // Reading from bank control register returns current bank number
    if (address === RAMCard.BANK_CONTROL_REGISTER) {
      return this.currentBank
    }
    
    // Calculate actual address in RAM: bank * bank_size + offset and return data
    return this.data[this.currentBank * RAMCard.BANK_SIZE + address]
  }

  write(address: number, data: number): void {
    // Writing to bank control register switches banks
    if (address === RAMCard.BANK_CONTROL_REGISTER) {
      this.currentBank = data & 0xFF // Ensure 0-255 range
      return
    }
    
    // Calculate actual address in RAM: bank * bank_size + offset as store data
    this.data[this.currentBank * RAMCard.BANK_SIZE + address] = data & 0xFF
  }
  
  tick(frequency: number): void {}
  
  reset(coldStart: boolean): void {
    if (coldStart) {
      this.currentBank = 0
      this.data.fill(0x00)
    }
  }

}