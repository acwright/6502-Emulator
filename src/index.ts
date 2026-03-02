#! /usr/bin/env node

import figlet from 'figlet'
import { Machine } from './components/Machine'
import { Command } from 'commander'
import { SerialPort } from 'serialport'
import sdl from '@kmamal/sdl'

const VERSION = '1.0.0'
const WIDTH = 320
const HEIGHT = 240

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
  .addHelpText('beforeAll', figlet.textSync('6502 Emulator', { font: 'cricket' }) + '\n' + `Version: ${VERSION} | A.C. Wright Design\n`)
  .parse(process.argv)

const options = program.opts()

// Serial port configuration
const port = options.port
const baudRate = parseInt(options.baudrate)
const parity = options.parity as 'odd' | 'even' | 'none'
const dataBits = parseInt(options.databits) as 5 | 6 | 7 | 8
const stopBits = parseFloat(options.stopbits) as 1 | 1.5 | 2

// Validate options
if (dataBits !== 5 && dataBits !== 6 && dataBits !== 7 && dataBits !== 8) {
  console.log('Error: Invalid Data Bits')
  process.exit(1)
}
if (stopBits !== 1 && stopBits !== 1.5 && stopBits !== 2) {
  console.log('Error: Invalid Stop Bits')
  process.exit(1)
}

// Create Machine instance
const machine = new Machine()

// Serial port instance
let serialPort: SerialPort | undefined

// Controller state tracking
const controllers = new Map<number, any>()
let joystickButtonState: number = 0x00

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

// Helper function to setup controller event handlers
function setupControllerHandlers(controller: any, device: any): void {
  (controller as any).on('buttonDown', (button: string) => {
    switch (button) {
      case 'dpadUp':
        joystickButtonState |= BUTTON_UP
        break
      case 'dpadDown':
        joystickButtonState |= BUTTON_DOWN
        break
      case 'dpadLeft':
        joystickButtonState |= BUTTON_LEFT
        break
      case 'dpadRight':
        joystickButtonState |= BUTTON_RIGHT
        break
      case 'a':
        joystickButtonState |= BUTTON_A
        break
      case 'b':
        joystickButtonState |= BUTTON_B
        break
      case 'back':
        joystickButtonState |= BUTTON_SELECT
        break
      case 'start':
        joystickButtonState |= BUTTON_START
        break
    }
    machine.onJoystick(joystickButtonState)
  })

  (controller as any).on('buttonUp', (button: string) => {
    switch (button) {
      case 'dpadUp':
        joystickButtonState &= ~BUTTON_UP
        break
      case 'dpadDown':
        joystickButtonState &= ~BUTTON_DOWN
        break
      case 'dpadLeft':
        joystickButtonState &= ~BUTTON_LEFT
        break
      case 'dpadRight':
        joystickButtonState &= ~BUTTON_RIGHT
        break
      case 'a':
        joystickButtonState &= ~BUTTON_A
        break
      case 'b':
        joystickButtonState &= ~BUTTON_B
        break
      case 'back':
        joystickButtonState &= ~BUTTON_SELECT
        break
      case 'start':
        joystickButtonState &= ~BUTTON_START
        break
    }
    machine.onJoystick(joystickButtonState)
  })

  controller.on('axisMotion', ({ axis, value }: { axis: string; value: number }) => {
    if (axis === 'leftStickX') {
      if (value < -AXIS_THRESHOLD) {
        joystickButtonState |= BUTTON_LEFT
        joystickButtonState &= ~BUTTON_RIGHT
      } else if (value > AXIS_THRESHOLD) {
        joystickButtonState |= BUTTON_RIGHT
        joystickButtonState &= ~BUTTON_LEFT
      } else {
        joystickButtonState &= ~(BUTTON_LEFT | BUTTON_RIGHT)
      }
      machine.onJoystick(joystickButtonState)
    } else if (axis === 'leftStickY') {
      if (value < -AXIS_THRESHOLD) {
        joystickButtonState |= BUTTON_UP
        joystickButtonState &= ~BUTTON_DOWN
      } else if (value > AXIS_THRESHOLD) {
        joystickButtonState |= BUTTON_DOWN
        joystickButtonState &= ~BUTTON_UP
      } else {
        joystickButtonState &= ~(BUTTON_UP | BUTTON_DOWN)
      }
      machine.onJoystick(joystickButtonState)
    }
  })

  controller.on('close', () => {
    console.log(`Controller closed: ${device.name || device.id}`)
    controllers.delete(device.id)
  })
}

// Setup serial port connection
if (port) {
  serialPort = new SerialPort({
    path: port,
    baudRate: baudRate,
    parity: parity,
    dataBits: dataBits,
    stopBits: stopBits
  }, (err) => {
    if (err) {
      console.log('Error: ', err.message)
    }
  })

  serialPort.on('data', (data: Buffer<ArrayBuffer>) => {
    for (let i = 0; i < data.length; i++) {
      machine.onReceive(data[i]) // Pass data to machine
    }
  })

  machine.transmit = (data: number) => {
    if (serialPort && serialPort.isOpen) {
      serialPort.write(Buffer.from([data]), (err) => {
        if (err) {
          console.log('Error sending serial data: ', err.message)
        }
      })
    }
  }
}

if (options.rom) {
  machine.loadROM(options.rom)
  console.log(`Loaded ROM: ${options.rom}`)
} else {
  console.log('Loaded ROM: NONE')
}
if (options.cart) {
  machine.loadCart(options.cart)
  console.log(`Loaded Cart: ${options.cart}`)
} else {
  console.log('Loaded Cart: NONE')
}
if (options.freq) {
  const frequency = Number(options.freq)
  
  if (!isNaN(frequency)) {
    machine.frequency = frequency
    console.log(`Frequency: ${options.freq} Hz`)
  } else {
    console.log()
    console.error(`Aborting... Error Invalid Frequency: '${options.freq}'`)
    process.exit(1)
  }
} else {
  console.log("Frequency: 1000000 Hz")
}
if (options.scale) {
  const scale = Number(options.scale)

  if (!isNaN(scale)) {
    machine.scale = scale
    console.log(`Scale: ${options.scale}x`)
  } else {
    console.log()
    console.error(`Aborting... Error Invalid Scale: '${options.scale}'`)
    process.exit(1)
  }
} else {
  console.log(`Scale: 1x`)
}

const window = sdl.video.createWindow({
  title: "6502 Emulator",
  width: WIDTH * machine.scale,
  height: HEIGHT * machine.scale,
  accelerated: true,
  vsync: true
})

window.on('keyDown', (event) => {
  if (!event.scancode) { return }

  machine.onKeyDown(event.scancode)
})

window.on('keyUp', (event) => {
  if (!event.scancode) { return }

  machine.onKeyUp(event.scancode)
})

machine.render = (buffer: Buffer) => {
  if (!window) { return }

  window.render(WIDTH, HEIGHT, WIDTH * 4, 'rgba32', buffer)
}

// Controller device add/remove handlers
(sdl.controller as any).on('deviceAdd', (device: any) => {
  console.log(`Controller added: ${device.name || device.id}`)
  
  try {
    const controller = sdl.controller.openDevice(device);
    controllers.set(device.id, controller);
    
    setupControllerHandlers(controller, device)
    
    console.log(`Controller ${device.name || device.id} opened successfully`)
  } catch (error) {
    console.error(`Failed to open controller ${device.name || device.id}:`, error)
  }
})

(sdl.controller as any).on('deviceRemove', (device: any) => {
  console.log(`Controller removed: ${device.name || device.id}`)
  
  const controller = controllers.get(device.id);
  if (controller && !controller.closed) {
    controller.close();
  }
  controllers.delete(device.id);
  
  // Clear joystick state when all controllers are removed
  if (controllers.size === 0) {
    joystickButtonState = 0x00;
    machine.onJoystick(joystickButtonState);
  }
});

window.on('close', () => {
  // Close all connected controllers
  for (const [id, controller] of controllers.entries()) {
    if (!controller.closed) {
      console.log(`Closing controller ${id}`)
      controller.close()
    }
  }
  controllers.clear()
  
  if (serialPort && serialPort.isOpen) {
    serialPort.close((err) => {
      if (err) {
        console.log('Error closing serial port: ', err.message)
      }
    })
  }
  machine.end()

  const uptime = Date.now() - machine.startTime

  console.log()
  console.log('Result:')
  console.table({
    'Time Elapsed': uptime / 1000,
    'CPU Cycles': machine.cpu.cycles,
    'Frames': machine.frames,
    'Avg FPS': parseFloat((machine.frames / (uptime / 1000)).toFixed(2))
  })
})

// Initialize controllers - detect any already connected
console.log('Scanning for controllers...')
const devices = sdl.controller.devices
if (devices && devices.length > 0) {
  console.log(`Found ${devices.length} controller(s)`)
  devices.forEach((device: any) => {
    try {
      const controller = sdl.controller.openDevice(device);
      controllers.set(device.id, controller);
      
      setupControllerHandlers(controller, device)
      
      console.log(`Controller ${device.name || device.id} opened successfully`)
    } catch (error) {
      console.error(`Failed to open controller ${device.name || device.id}:`, error)
    }
  })
} else {
  console.log('No controllers found')
}

machine.start()