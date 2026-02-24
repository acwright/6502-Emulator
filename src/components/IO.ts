export interface IO {

  raiseIRQ: () => void
  raiseNMI: () => void

  read(address: number): number
  write(address: number, data: number): void
  tick(frequency: number): void
  reset(coldStart: boolean): void
  
}