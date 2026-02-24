import { CPU } from '../components/CPU'

test('CPU can init', () => {
	expect(new CPU(() => { return 0 }, () => {})).not.toBeNull()
})

test('CPU can reset', () => {
	const cpu = new CPU((address) => {
		if (address == 0xFFFC) {
			return 0x00
		}
		if (address == 0xFFFD) {
			return 0x80
		}
		return 0x0000
	}, () => {})

	expect(cpu.pc).toBe(0x8000)
	expect(cpu.a).toBe(0x00)
	expect(cpu.x).toBe(0x00)
	expect(cpu.y).toBe(0x00)
	expect(cpu.sp).toBe(0xFD)
	expect(cpu.st).toBe(0x00 | CPU.U)
	expect(cpu.cycles).toBe(7)
})

test('CPU can irq', () => {
	let ram: number[] = [...Array(0x0200)].fill(0x00)
	
	const cpu = new CPU((address) => {
		if (address == 0xFFFC) {
			return 0x00
		}
		if (address == 0xFFFD) {
			return 0x80
		}
		if (address == 0xFFFE) {
			return 0x00
		}
		if (address == 0xFFFF) {
			return 0xA0
		}
		return 0x0000
	}, (address, data) => {
		ram[address] = data
	})

	cpu.st |= CPU.I // Disable interrupts
	cpu.irq()

	expect(cpu.cycles).toBe(7)

	cpu.st &= ~CPU.I // Enable interrupts
	cpu.irq()

	expect(cpu.sp).toBe(0xFD - 3)
	expect(ram[0x01FD]).toBe(0x0080)
	expect(ram[0x01FC]).toBe(0x0000)
	expect(ram[0x01FB]).toBe(0x00 | CPU.U | CPU.I)
	expect(cpu.pc).toBe(0xA000)
	expect(cpu.cycles).toBe(14)
})

test('CPU can nmi', () => {
	let ram: number[] = [...Array(0x0200)].fill(0x00)
	
	const cpu = new CPU((address) => {
		if (address == 0xFFFC) {
			return 0x00
		}
		if (address == 0xFFFD) {
			return 0x80
		}
		if (address == 0xFFFA) {
			return 0x00
		}
		if (address == 0xFFFB) {
			return 0xA0
		}
		return 0x0000
	}, (address, data) => {
		ram[address] = data
	})

	expect(cpu.cycles).toBe(7)

	cpu.nmi()

	expect(cpu.sp).toBe(0xFD - 3)
	expect(ram[0x01FD]).toBe(0x0080)
	expect(ram[0x01FC]).toBe(0x0000)
	expect(ram[0x01FB]).toBe(0x00 | CPU.U | CPU.I)
	expect(cpu.pc).toBe(0xA000)
	expect(cpu.cycles).toBe(14)
})

test('CPU can tick', () => {
	const cpu = new CPU((address) => {
		if (address == 0xFFFC) {
			return 0x00
		}
		if (address == 0xFFFD) {
			return 0x80
		}
		if (address == 0x8000) {
			return 0xEA
		}
		return 0x0000
	}, () => {})

	expect(cpu.cycles).toBe(7)
	expect(cpu.cyclesRem).toBe(7)

	cpu.tick()
	cpu.tick()
	cpu.tick()
	cpu.tick()
	cpu.tick()
	cpu.tick()
	cpu.tick()

	expect(cpu.cycles).toBe(7)
	expect(cpu.cyclesRem).toBe(0)

	cpu.tick()

	expect(cpu.pc).toBe(0x8001)
	expect(cpu.cycles).toBe(9)
	expect(cpu.cyclesRem).toBe(1)

	cpu.tick()

	expect(cpu.cycles).toBe(9)
	expect(cpu.cyclesRem).toBe(0)
})

test('CPU can step', () => {
	const cpu = new CPU((address) => {
		if (address == 0xFFFC) {
			return 0x00
		}
		if (address == 0xFFFD) {
			return 0x80
		}
		if (address == 0x8000) {
			return 0xEA
		}
		return 0x0000
	}, () => {})

	expect(cpu.cycles).toBe(7)
	expect(cpu.cyclesRem).toBe(7)

	const cyclesExecuted = cpu.step()

	expect(cyclesExecuted).toBe(2)
	expect(cpu.cycles).toBe(9)
	expect(cpu.cyclesRem).toBe(0)
	expect(cpu.pc).toBe(0x8001)
})

// TODO: Move to using https://github.com/SingleStepTests/65x02/tree/main/6502

// See https://analog-hors.github.io/site/pones-p1/
// for implementing Klaus 6502 tests

// test('CPU can pass Klaus functional test (6502 Functional Test.bin)', async t => {
// 	let ram: number[]
	
// 	try {
// 		ram = Array.from(new Uint8Array(await readFile(__dirname + '/../../../Software/Tests/6502 Functional Test/build/6502 Functional Test.bin')))
// 	} catch (error) {
// 		console.error('Error reading file:', error)
// 	}

// 	const cpu = new CPU((address) => {
// 		return ram[address]
// 	}, (address, data) => {
// 		ram[address] = data
// 	})

// 	t.is(cpu.cycles, 7)
// 	t.is(cpu.cyclesRem, 7)

// 	// Tick off reset cycles
// 	do {
// 		cpu.tick()
// 	} while (cpu.cyclesRem != 0)

// 	t.is(cpu.cycles, 7)
// 	t.is(cpu.cyclesRem, 0)

// 	// Set PC to program start
// 	cpu.pc = 0x0400
	
// 	let prevPC: number = cpu.pc
// 	do {
// 		prevPC = cpu.pc
// 		cpu.step()
// 	} while (cpu.pc != prevPC)

// 	t.is(cpu.pc, 0x3469)
// })