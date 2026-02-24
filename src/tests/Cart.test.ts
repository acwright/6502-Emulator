import { Cart } from '../components/Cart'

test('Cart can init', () => {
	expect(new Cart()).not.toBeNull()
})