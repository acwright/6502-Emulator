import { CPU } from './CPU'
import { RAM } from './RAM'
import { ROM } from './ROM'
import { Cart } from './Cart'
import { GPIOCard } from './IO/GPIOCard'
import { RAMCard } from './IO/RAMCard'
import { RTCCard } from './IO/RTCCard'
import { SerialCard } from './IO/SerialCard'
import { SoundCard } from './IO/SoundCard'
import { StorageCard } from './IO/StorageCard'
import { VideoCard } from './IO/VideoCard'
import { readFile } from 'fs/promises'

export class Machine {

  static MAX_FPS: number = 60
  static FRAME_INTERVAL_MS: number = 1000 / Machine.MAX_FPS

  cpu: CPU
  ram: RAM
  rom: ROM  
  io1: RAMCard
  io2: RAMCard
  io3: RTCCard
  io4: StorageCard
  io5: SerialCard
  io6: GPIOCard
  io7: SoundCard
  io8: VideoCard

  cart?: Cart

  isAlive: boolean = false
  isRunning: boolean = false
  frequency: number = 1000000 // 1 MHz
  scale: number = 2
  frames: number = 0
  frameDelay: number = 0
  frameDelayCount: number = 0
  startTime: number = 0
  previousTime: number = Date.now()

  transmit?: (data: number) => void
  render?: (buffer: Buffer<ArrayBufferLike>) => void

  //
  // Initialization
  //

  constructor() {
    this.cpu = new CPU(this.read.bind(this), this.write.bind(this))
    this.ram = new RAM()
    this.rom = new ROM()
    this.io1 = new RAMCard()
    this.io2 = new RAMCard()
    this.io3 = new RTCCard()
    this.io4 = new StorageCard()
    this.io5 = new SerialCard()
    this.io6 = new GPIOCard()
    this.io7 = new SoundCard()
    this.io8 = new VideoCard()

    // Connect SerialCard IRQ/NMI to CPU
    this.io5.raiseIRQ = () => this.cpu.irq()
    this.io5.raiseNMI = () => this.cpu.nmi()

    // Connect SerialCard transmit callback (use arrow function to look up this.transmit at call time)
    this.io5.transmit = (data: number) => {
      if (this.transmit) {
        this.transmit(data)
      }
    }

    this.cpu.reset()
  }

  //
  // Methods
  //

  loadROM = async (path: string) => {
    try {
      this.rom.load(Array.from(new Uint8Array(await readFile(path))))
    } catch (error) {
      console.error('Error reading file:', error)
    }
  }

  loadCart = async (path: string) => {
    try {
      const data = Array.from(new Uint8Array(await readFile(path)))
      const cart = new Cart()
      cart.load(data)
      this.cart = cart
    } catch (error) {
      console.error('Error reading file:', error)
    }
  }

  start(): void {
    this.startTime = Date.now()
    this.isRunning = true
    this.isAlive = true
    this.loop()
  }

  end(): void {
    this.isRunning = false
    this.isAlive = false
  }

  onReceive(data: number): void {
    this.io5.onData(data) // Pass data to Serial card
  }

  onKeyDown(key: string): void {
    this.io6.onKeyDown(key) // Pass key to GPIO card
  }

  onKeyUp(key: string): void {
    this.io6.onKeyUp(key) // Pass key to GPIO card
  }

  //
  // Loop Operations
  //

  private loop(): void {
    if (!this.isAlive) { return }
    
    if (this.isRunning) {
      const currentTime = Date.now()
      const deltaTime = currentTime - this.previousTime;
      this.previousTime = currentTime
      const fps = 1 / (deltaTime / 1000)
      const frequency = this.frequency

      if (frequency >= fps) {
        const cycles = Math.floor(frequency / fps)

        for (let i = 0; i < cycles; i++) {
          this.cpu.tick()
          this.io1.tick(frequency)
          this.io2.tick(frequency)
          this.io3.tick(frequency)
          this.io4.tick(frequency)
          this.io5.tick(frequency)
          this.io6.tick(frequency)
          this.io7.tick(frequency)
          this.io8.tick(frequency)
        }
      } else {
        this.frameDelay = Math.floor(fps / frequency)

        if (this.frameDelayCount >= this.frameDelay) {
          this.cpu.tick()
          this.io1.tick(frequency)
          this.io2.tick(frequency)
          this.io3.tick(frequency)
          this.io4.tick(frequency)
          this.io5.tick(frequency)
          this.io6.tick(frequency)
          this.io7.tick(frequency)
          this.io8.tick(frequency)

          this.frameDelayCount = 0
        } else {
          this.frameDelayCount += 1
        }
      }
    }

    if (this.render) {
      this.render(this.io8.buffer)
    }
    this.frames += 1

    setTimeout(this.loop.bind(this), Math.floor(Machine.FRAME_INTERVAL_MS))
  }

  //
  // Bus Operations
  //

  reset(coldStart: boolean): void {
    this.cpu.reset()
    this.ram.reset(coldStart)
    this.io1.reset(coldStart)
    this.io2.reset(coldStart)
    this.io3.reset(coldStart)
    this.io4.reset(coldStart)
    this.io5.reset(coldStart)
    this.io6.reset(coldStart)
    this.io7.reset(coldStart)
    this.io8.reset(coldStart)
  }

  read(address: number): number {
    switch(true) {
      case (this.cart && address >= Cart.CODE && address <= Cart.END):
        return this.cart.read(address - Cart.START)
      case (address >= ROM.CODE && address <= ROM.END):
        return this.rom.read(address - ROM.START)
      case (address >= RAM.START && address <= RAM.END):
        return this.ram.read(address)
      case (address >= 0x8000 && address <= 0x83FF):
        return this.io1.read(address - 0x8000) || 0
      case (address >= 0x8400 && address <= 0x87FF):
        return this.io2.read(address - 0x8400) || 0
      case (address >= 0x8800 && address <= 0x8BFF):
        return this.io3.read(address - 0x8800) || 0
      case (address >= 0x8C00 && address <= 0x8FFF):
        return this.io4.read(address - 0x8C00) || 0
      case (address >= 0x9000 && address <= 0x93FF):
        return this.io5.read(address - 0x9000) || 0
      case (address >= 0x9400 && address <= 0x97FF):
        return this.io6.read(address - 0x9400) || 0
      case (address >= 0x9800 && address <= 0x9BFF):
        return this.io7.read(address - 0x9800) || 0
      case (address >= 0x9C00 && address <= 0x9FFF):
        return this.io8.read(address - 0x9C00) || 0
      default:
        return 0
    }
  }

  write(address: number, data: number): void {
    switch(true) {
      case (address >= RAM.START && address <= RAM.END):
        this.ram.write(address, data)
        return
      case (address >= 0x8000 && address <= 0x83FF):
        this.io1.write(address - 0x8000, data)
        return
      case (address >= 0x8400 && address <= 0x87FF):
        this.io2.write(address - 0x8400, data)
        return
      case (address >= 0x8800 && address <= 0x8BFF):
        this.io3.write(address - 0x8800, data)
        return
      case (address >= 0x8C00 && address <= 0x8FFF):
        this.io4.write(address - 0x8C00, data)
        return
      case (address >= 0x9000 && address <= 0x93FF):
        this.io5.write(address - 0x9000, data)
        return
      case (address >= 0x9400 && address <= 0x97FF):
        this.io6.write(address - 0x9400, data)
        return
      case (address >= 0x9800 && address <= 0x9BFF):
        this.io7.write(address - 0x9800, data)
        return
      case (address >= 0x9C00 && address <= 0x9FFF):
        this.io8.write(address - 0x9C00, data)
        return
      default:
        return
    }
  }

}