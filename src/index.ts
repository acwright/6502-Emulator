#! /usr/bin/env node

import figlet from 'figlet'
import { Machine } from './components/Machine'
import { Command } from 'commander'
import { SerialPort } from 'serialport'
import sdl from '@kmamal/sdl'

const VERSION = '1.0.0'
const WIDTH = 320
const HEIGHT = 240

// Audio constants
const AUDIO_SAMPLE_RATE = 44100
const AUDIO_CHANNELS = 1
const AUDIO_FORMAT = 'f32'
const AUDIO_BUFFERED = 2048

// Joystick button bit masks (matching GPIOJoystickAttachment)
const BUTTON_UP = 0x01
const BUTTON_DOWN = 0x02
const BUTTON_LEFT = 0x04
const BUTTON_RIGHT = 0x08
const BUTTON_A = 0x10
const BUTTON_B = 0x20
const BUTTON_SELECT = 0x40
const BUTTON_START = 0x80

// Axis threshold for converting analog input to digital (50% of normalized range)
const AXIS_THRESHOLD = 0.5

interface EmulatorOptions {
  cart?: string
  freq?: string
  rom?: string
  scale?: string
  baudrate?: string
  parity?: string
  databits?: string
  stopbits?: string
  port?: string
  storage?: string
}

class Emulator {
  private machine: Machine
  private serialPort?: SerialPort
  private window?: any
  private audioDevice?: any
  private controllers: Map<number, any>
  private joystickButtonState: number
  private options: EmulatorOptions

  constructor(options: EmulatorOptions) {
    this.options = options
    this.machine = new Machine()
    this.controllers = new Map()
    this.joystickButtonState = 0x00
  }

  async initialize(): Promise<void> {
    this.validateOptions()
    await this.loadBinaries()
    this.configureFrequency()
    this.configureScale()
    this.setupSerialPort()
    this.setupAudio()
    this.setupWindow()
    this.setupControllers()
  }

  private validateOptions(): void {
    const dataBits = parseInt(this.options.databits || '8') as 5 | 6 | 7 | 8
    const stopBits = parseFloat(this.options.stopbits || '1') as 1 | 1.5 | 2

    if (dataBits !== 5 && dataBits !== 6 && dataBits !== 7 && dataBits !== 8) {
      console.log('Error: Invalid Data Bits')
      process.exit(1)
    }
    if (stopBits !== 1 && stopBits !== 1.5 && stopBits !== 2) {
      console.log('Error: Invalid Stop Bits')
      process.exit(1)
    }
  }

  private async loadBinaries(): Promise<void> {
    if (this.options.rom) {
      await this.machine.loadROM(this.options.rom)
      console.log(`Loaded ROM: ${this.options.rom}`)
    } else {
      console.log('Loaded ROM: NONE')
    }

    if (this.options.cart) {
      await this.machine.loadCart(this.options.cart)
      console.log(`Loaded Cart: ${this.options.cart}`)
    } else {
      console.log('Loaded Cart: NONE')
    }

    if (this.options.storage) {
      await this.machine.io4.loadFromFile(this.options.storage)
    }
  }

  private configureFrequency(): void {
    if (this.options.freq) {
      const frequency = Number(this.options.freq)
      
      if (!isNaN(frequency)) {
        this.machine.frequency = frequency
        console.log(`Frequency: ${this.options.freq} Hz`)
      } else {
        console.log()
        console.error(`Aborting... Error Invalid Frequency: '${this.options.freq}'`)
        process.exit(1)
      }
    } else {
      console.log("Frequency: 1000000 Hz")
    }
  }

  private configureScale(): void {
    if (this.options.scale) {
      const scale = Number(this.options.scale)

      if (!isNaN(scale)) {
        this.machine.scale = scale
        console.log(`Scale: ${this.options.scale}x`)
      } else {
        console.log()
        console.error(`Aborting... Error Invalid Scale: '${this.options.scale}'`)
        process.exit(1)
      }
    } else {
      console.log(`Scale: 1x`)
    }
  }

  private setupSerialPort(): void {
    if (!this.options.port) {
      return
    }

    const baudRate = parseInt(this.options.baudrate || '9600')
    const parity = (this.options.parity || 'none') as 'odd' | 'even' | 'none'
    const dataBits = parseInt(this.options.databits || '8') as 5 | 6 | 7 | 8
    const stopBits = parseFloat(this.options.stopbits || '1') as 1 | 1.5 | 2

    this.serialPort = new SerialPort({
      path: this.options.port,
      baudRate: baudRate,
      parity: parity,
      dataBits: dataBits,
      stopBits: stopBits
    }, (err) => {
      if (err) {
        console.log('Error: ', err.message)
      }
    })

    this.serialPort.on('data', (data: Buffer<ArrayBuffer>) => {
      for (let i = 0; i < data.length; i++) {
        this.machine.onReceive(data[i])
      }
    })

    this.machine.transmit = (data: number) => {
      if (this.serialPort && this.serialPort.isOpen) {
        this.serialPort.write(Buffer.from([data]), (err) => {
          if (err) {
            console.log('Error sending serial data: ', err.message)
          }
        })
      }
    }
  }

  private setupAudio(): void {
    try {
      this.audioDevice = sdl.audio.openDevice({ type: 'playback' }, {
        channels: AUDIO_CHANNELS as 1,
        frequency: AUDIO_SAMPLE_RATE,
        format: AUDIO_FORMAT as any,
        buffered: AUDIO_BUFFERED,
      })

      // Configure SoundCard sample rate to match audio device
      this.machine.io7.sampleRate = this.audioDevice.frequency

      // Connect the Machine's audio callback to the SDL audio device
      this.machine.pushAudioSamples = (samples: Float32Array) => {
        if (!this.audioDevice || this.audioDevice.closed) return

        const { channels, bytesPerSample } = this.audioDevice
        const buffer = Buffer.alloc(samples.length * channels * bytesPerSample)
        let offset = 0
        for (let i = 0; i < samples.length; i++) {
          for (let ch = 0; ch < channels; ch++) {
            offset = this.audioDevice.writeSample(buffer, samples[i], offset)
          }
        }
        this.audioDevice.enqueue(buffer)
      }

      this.audioDevice.play()
      console.log(`Audio: ${this.audioDevice.frequency} Hz, ${AUDIO_FORMAT}, buffer ${AUDIO_BUFFERED}`)
    } catch (error) {
      console.error('Failed to initialize audio:', error)
    }
  }

  private setupWindow(): void {
    this.window = sdl.video.createWindow({
      title: "6502 Emulator",
      width: WIDTH * this.machine.scale,
      height: HEIGHT * this.machine.scale,
      accelerated: true,
      vsync: true
    })

    this.window.on('keyDown', (event: any) => {
      if (!event.scancode) { return }
      this.machine.onKeyDown(event.scancode)
    })

    this.window.on('keyUp', (event: any) => {
      if (!event.scancode) { return }
      this.machine.onKeyUp(event.scancode)
    })

    this.machine.render = (buffer: Buffer) => {
      if (!this.window) { return }
      this.window.render(WIDTH, HEIGHT, WIDTH * 4, 'rgba32', buffer)
    }

    this.window.on('close', () => this.shutdown())
  }

  private setupControllers(): void {
    // Controller device add/remove handlers
    (sdl.controller as any).on('deviceAdd', (device: any) => {
      console.log(`Controller added: ${device.name || device.id}`)
      
      try {
        const controller = sdl.controller.openDevice(device)
        this.controllers.set(device.id, controller)
        
        this.setupControllerHandlers(controller, device)
        
        console.log(`Controller ${device.name || device.id} opened successfully`)
      } catch (error) {
        console.error(`Failed to open controller ${device.name || device.id}:`, error)
      }
    })

    ;(sdl.controller as any).on('deviceRemove', (device: any) => {
      console.log(`Controller removed: ${device.name || device.id}`)
      
      const controller = this.controllers.get(device.id)
      if (controller && !controller.closed) {
        controller.close()
      }
      this.controllers.delete(device.id)
      
      // Clear joystick state when all controllers are removed
      if (this.controllers.size === 0) {
        this.joystickButtonState = 0x00
        this.machine.onJoystick(this.joystickButtonState)
      }
    })

    // Initialize controllers - detect any already connected
    console.log('Scanning for controllers...')
    const devices = sdl.controller.devices
    if (devices && devices.length > 0) {
      console.log(`Found ${devices.length} controller(s)`)
      devices.forEach((device: any) => {
        try {
          const controller = sdl.controller.openDevice(device)
          this.controllers.set(device.id, controller)
          
          this.setupControllerHandlers(controller, device)
          
          console.log(`Controller ${device.name || device.id} opened successfully`)
        } catch (error) {
          console.error(`Failed to open controller ${device.name || device.id}:`, error)
        }
      })
    } else {
      console.log('No controllers found')
    }
  }

  private setupControllerHandlers(controller: any, device: any): void {
    (controller as any).on('buttonDown', (button: string) => {
      switch (button) {
        case 'dpadUp':
          this.joystickButtonState |= BUTTON_UP
          break
        case 'dpadDown':
          this.joystickButtonState |= BUTTON_DOWN
          break
        case 'dpadLeft':
          this.joystickButtonState |= BUTTON_LEFT
          break
        case 'dpadRight':
          this.joystickButtonState |= BUTTON_RIGHT
          break
        case 'a':
          this.joystickButtonState |= BUTTON_A
          break
        case 'b':
          this.joystickButtonState |= BUTTON_B
          break
        case 'back':
          this.joystickButtonState |= BUTTON_SELECT
          break
        case 'start':
          this.joystickButtonState |= BUTTON_START
          break
      }
      this.machine.onJoystick(this.joystickButtonState)
    })

    ;(controller as any).on('buttonUp', (button: string) => {
      switch (button) {
        case 'dpadUp':
          this.joystickButtonState &= ~BUTTON_UP
          break
        case 'dpadDown':
          this.joystickButtonState &= ~BUTTON_DOWN
          break
        case 'dpadLeft':
          this.joystickButtonState &= ~BUTTON_LEFT
          break
        case 'dpadRight':
          this.joystickButtonState &= ~BUTTON_RIGHT
          break
        case 'a':
          this.joystickButtonState &= ~BUTTON_A
          break
        case 'b':
          this.joystickButtonState &= ~BUTTON_B
          break
        case 'back':
          this.joystickButtonState &= ~BUTTON_SELECT
          break
        case 'start':
          this.joystickButtonState &= ~BUTTON_START
          break
      }
      this.machine.onJoystick(this.joystickButtonState)
    })

    controller.on('axisMotion', ({ axis, value }: { axis: string; value: number }) => {
      if (axis === 'leftStickX') {
        if (value < -AXIS_THRESHOLD) {
          this.joystickButtonState |= BUTTON_LEFT
          this.joystickButtonState &= ~BUTTON_RIGHT
        } else if (value > AXIS_THRESHOLD) {
          this.joystickButtonState |= BUTTON_RIGHT
          this.joystickButtonState &= ~BUTTON_LEFT
        } else {
          this.joystickButtonState &= ~(BUTTON_LEFT | BUTTON_RIGHT)
        }
        this.machine.onJoystick(this.joystickButtonState)
      } else if (axis === 'leftStickY') {
        if (value < -AXIS_THRESHOLD) {
          this.joystickButtonState |= BUTTON_UP
          this.joystickButtonState &= ~BUTTON_DOWN
        } else if (value > AXIS_THRESHOLD) {
          this.joystickButtonState |= BUTTON_DOWN
          this.joystickButtonState &= ~BUTTON_UP
        } else {
          this.joystickButtonState &= ~(BUTTON_UP | BUTTON_DOWN)
        }
        this.machine.onJoystick(this.joystickButtonState)
      }
    })

    controller.on('close', () => {
      console.log(`Controller closed: ${device.name || device.id}`)
      this.controllers.delete(device.id)
    })
  }

  private shutdown(): void {
    // Close all connected controllers
    for (const [id, controller] of this.controllers.entries()) {
      if (!controller.closed) {
        console.log(`Closing controller ${id}`)
        controller.close()
      }
    }
    this.controllers.clear()
    
    // Close the audio device
    if (this.audioDevice && !this.audioDevice.closed) {
      this.audioDevice.pause()
      this.audioDevice.close()
    }

    if (this.serialPort && this.serialPort.isOpen) {
      this.serialPort.close((err) => {
        if (err) {
          console.log('Error closing serial port: ', err.message)
        }
      })
    }
    this.machine.end()

    const uptime = Date.now() - this.machine.startTime

    console.log()
    console.log('Result:')
    console.table({
      'Time Elapsed': uptime / 1000,
      'CPU Cycles': this.machine.cpu.cycles,
      'Frames': this.machine.frames,
      'Avg FPS': parseFloat((this.machine.frames / (uptime / 1000)).toFixed(2))
    })
    
    // Save storage data if path was provided
    if (this.options.storage) {
      this.machine.io4.saveToFile(this.options.storage).then(() => {
        process.exit(0)
      }).catch(() => {
        process.exit(1)
      })
    } else {
      process.exit(0)
    }
  }

  start(): void {
    this.machine.start()
  }
}

// Parse command line arguments
const program = new Command()
program
  .name('ac6502')
  .description('Emulator for the A.C. Wright 6502 project.')
  .version(VERSION, '-v, --version', 'Output the current emulator version')
  .helpOption('-h, --help', 'Output help / options')
  .option('-c, --cart <path>', 'Path to 32K Cart binary file')
  .option('-f, --freq <freq>', 'Set the clock frequency in Hz', '2000000')
  .option('-r, --rom <path>', 'Path to 32K ROM binary file')
  .option('-s, --scale <scale>', 'Set the emulator scale', '2')
  .option('-b, --baudrate <baudrate>', 'Baud Rate', '9600')
  .option('-a, --parity <parity>', 'Parity (odd | even | none)', 'none')
  .option('-d, --databits <databits>', 'Data Bits (5 | 6 | 7 | 8)', '8')
  .option('-t, --stopbits <stopbits>', 'Stop Bits (1 | 1.5 | 2)', '1')
  .option('-p, --port <port>', 'Path to the serial port (e.g., /dev/ttyUSB0)')
  .option('-S, --storage <path>', 'Path to storage data file for Compact Flash card persistence')
  .addHelpText('beforeAll', figlet.textSync('6502 Emulator', { font: 'cricket' }) + '\n' + `Version: ${VERSION} | A.C. Wright Design\n`)
  .parse(process.argv)

const options = program.opts()

// Main initialization function
async function main() {
  const emulator = new Emulator(options)
  await emulator.initialize()
  emulator.start()
}

// Run the main function
main().catch((error) => {
  console.error('Error:', error)
  process.exit(1)
})