import { ROM } from '../components/ROM'

test('ROM can init', () => {
	expect(new ROM()).not.toBeNull()
})

test('ROM can read', () => {
	const rom = new ROM()

	expect(rom.read(0x0000)).toBe(0xEA)
	expect(rom.read(0x7FFF)).toBe(0xEA)
})

test('ROM can load', () => {
	const rom = new ROM()

	rom.load([...Array(ROM.SIZE)].fill(0xAA))

	expect(rom.data[0x0000]).toBe(0xAA)
	expect(rom.data[0x7FFF]).toBe(0xAA)

	rom.load([...Array(ROM.SIZE)].fill(0x55))

	expect(rom.data[0x0000]).toBe(0x55)
	expect(rom.data[0x7FFF]).toBe(0x55)

	// Test loading with oversize data fails to load
	rom.load([...Array(ROM.SIZE + 1)].fill(0xEA))

	expect(rom.data[0x0000]).not.toBe(0xEA)
	expect(rom.data[0x7FFF]).not.toBe(0xEA)
	expect(rom.data[0x0000]).toBe(0x55)
	expect(rom.data[0x7FFF]).toBe(0x55)
})