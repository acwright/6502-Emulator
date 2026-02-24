import { ROM } from '../components/ROM'

test('ROM can init', () => {
	expect(new ROM()).not.toBeNull()
})
