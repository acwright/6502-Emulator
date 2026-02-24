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
  .option('-f, --freq <freq>', 'Set the clock frequency in Hz', '1000000')
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
  width: 256 * machine.scale,
  height: 192 * machine.scale
})

window.on('keyDown', (event) => {
  if (!event.key) { return }

  switch (event.key) {
    default:
      machine.onKeyDown(event.key)
      break
  }
})

window.on('keyUp', (event) => {
  if (!event.key) { return }

  switch (event.key) {
    case 'f11':
      machine.reset(true)  // Reset with cold start (clear RAM)
      break
    case 'f12':
      machine.reset(false) // Reset with warm start (keep RAM)
      break
    default:
      machine.onKeyUp(event.key)
      break
  }
})

machine.render = (buffer: Buffer) => {
  if (!window) { return }

  //const buffer = Buffer.alloc(WIDTH * HEIGHT * 4)

  // let offset = 0
  // for (let i = 0; i < HEIGHT; i++) {
  //   for (let j = 0; j < WIDTH; j++) {
  //     buffer[offset++] = Math.floor(Math.random() * 256)    // R
  //     buffer[offset++] = Math.floor(Math.random() * 256)    // G
  //     buffer[offset++] = Math.floor(Math.random() * 256)    // B
  //     buffer[offset++] = 255                                // A
  //   }
  // }

  window.render(WIDTH, HEIGHT, WIDTH * 4, 'rgba32', buffer)
}

window.on('close', () => {
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
    'Avg FPS': parseFloat((machine.frames / (uptime / 1000)).toFixed(4))
  })
})

machine.start()