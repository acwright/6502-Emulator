import { Machine } from '../components/Machine'

test('Machine can init', () => {
	expect(new Machine()).not.toBeNull()
})