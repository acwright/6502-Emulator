import { RAM } from '../components/RAM'

test('RAM can init', () => {
	expect(new RAM()).not.toBeNull()
})