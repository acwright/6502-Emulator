import { Cart } from '../components/Cart'
import { readFile } from 'fs/promises'

test('Cart can init', () => {
	expect(new Cart()).not.toBeNull()
})

test('Cart can write', () => {
	const cart = new Cart()

	cart.write(0x0200, 0xAA)
	cart.write(0x0400, 0x55)

	expect(cart.data[0x0200]).toBe(0xAA)
	expect(cart.data[0x0400]).toBe(0x55)
})

test('Cart can read', () => {
	const cart = new Cart()

	expect(cart.read(0x0000)).toBe(0x00)
	expect(cart.read(0x7FFF)).toBe(0x00)
})

test('Cart can load', () => {
	const cart = new Cart()

	cart.load([...Array(Cart.SIZE)].fill(0xAA))

	expect(cart.data[0x0000]).toBe(0xAA)
	expect(cart.data[0x7FFF]).toBe(0xAA)

	cart.load([...Array(Cart.SIZE)].fill(0x55))

	expect(cart.data[0x0000]).toBe(0x55)
	expect(cart.data[0x7FFF]).toBe(0x55)

	// Test loading with oversize data fails to load
	cart.load([...Array(Cart.SIZE + 1)].fill(0xEA))

	expect(cart.data[0x0000]).not.toBe(0xEA)
	expect(cart.data[0x7FFF]).not.toBe(0xEA)
	expect(cart.data[0x0000]).toBe(0x55)
	expect(cart.data[0x7FFF]).toBe(0x55)
})