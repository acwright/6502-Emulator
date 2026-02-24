#! /usr/bin/env node

import figlet from 'figlet'
import { Machine } from './components/Machine'
import { Command } from 'commander'
import sdl from '@kmamal/sdl'

const VERSION = '1.0.0'

console.log(figlet.textSync("6502 Emulator"))
console.log(`Version: ${VERSION} | A.C. Wright Design`)
console.log()

const machine = new Machine()

const program = new Command()
program
  .name('6502emulator')
  .description('A 6502 Emulator written in TypeScript for the A.C. Wright 6502 project')
  .version(VERSION, '-v, --version', 'Output the current emulator version')
  .helpOption('-h, --help', 'Output help / options')
  .option('-c, --cart <path>', 'Path to 32K Cart binary file')
  .option('-d, --debug', 'Enable debug mode', false)
  .option('-f, --freq <freq>', 'Set the clock frequency in Hz', '1000000')
  .option('-r, --rom <path>', 'Path to 32K ROM binary file')
  .option('-s, --scale <scale>', 'Set the emulator scale', '2')
  .parse(process.argv)

const options = program.opts()
if (options.cart) {
  machine.loadCart(options.cart)
  console.log(`Loaded Cart: ${options.cart}`)
} else {
  console.log('Loaded Cart: NONE')
}
if (options.rom) {
  machine.loadROM(options.rom)
  console.log(`Loaded ROM: ${options.rom}`)
} else {
  console.log('Loaded ROM: NONE')
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
if (options.debug) {
  machine.isDebugging = true
  console.log("Debug: Enabled")
} else {
  console.log("Debug: Disabled")
}

const window = sdl.video.createWindow({ 
  title: "6502 Emulator",
  width: 256 * machine.scale,
  height: 192 * machine.scale
})

window.on('keyDown', (event) => {
  switch (event.key) {
    case 'pause':
      machine.isRunning ? machine.stop() : machine.run()
      break
    case 'home':
      machine.debuggerMemoryPage = 0x00
      break
    case 'end':
      machine.debuggerMemoryPage = 0xFF
      break
    case 'pageUp':
      if (machine.debuggerMemoryPage < 0xFF) {
        machine.debuggerMemoryPage += 0x01
      }
      break
    case 'pageDown':
      if (machine.debuggerMemoryPage > 0x00) {
        machine.debuggerMemoryPage -= 0x01
      }
      break
    case 'f10':
      machine.reset()
      break
    case 'f11':
      machine.decreaseFrequency()
      break
    case 'f12':
      machine.increaseFrequency()
      break
    case 'space':
      if (!machine.isRunning) {
        machine.step()
      }
      break
    default:
      // TODO: Pass key to GPIO card
      break
  }
})

machine.render = () => {
  if (!window) { return }

  const buffer = Buffer.alloc(256 * 192 * 4)

  let offset = 0
  for (let i = 0; i < 192; i++) {
    for (let j = 0; j < 256; j++) {
      buffer[offset++] = Math.floor(256 * i / 192)    // R
      buffer[offset++] = Math.floor(256 * j / 256)    // G
      buffer[offset++] = 0                            // B
      buffer[offset++] = 255                          // A
    }
  }

  window.render(256, 192, 256 * 4, 'rgba32', buffer)
}

window.on('close', () => {
  const uptime = Date.now() - machine.startTime
  machine.end()

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