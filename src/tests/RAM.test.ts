import { RAM } from '../components/RAM'

test('RAM can init', () => {
	expect(new RAM()).not.toBeNull()
})

test('ROM can write', () => {
	const ram = new RAM()

	ram.write(0x0200, 0xAA)
	ram.write(0x0400, 0x55)

	expect(ram.data[0x0200]).toBe(0xAA)
	expect(ram.data[0x0400]).toBe(0x55)
})

test('ROM can read', () => {
	const ram = new RAM()

	expect(ram.read(0x0000)).toBe(0x00)
	expect(ram.read(0x7FFF)).toBe(0x00)
})