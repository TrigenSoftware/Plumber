import './devtools.ts'
import {
  context$,
  mount
} from 'nanoviews'
import { Home } from '~/pages/Home'
import './styles.css'

const root = document.getElementById('app')

if (!root) {
  throw new Error('#app is missing from index.html')
}

// The root injection context: the blocks of the page share the stores in it
mount(() => context$()(Home()), root)
