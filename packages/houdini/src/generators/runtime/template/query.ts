// externals
import { readable, Readable } from 'svelte/store'
import { onMount } from 'svelte'
// locals
import { registerDocumentStore, unregisterDocumentStore } from './runtime'
import { Operation, GraphQLTagResult } from './types'

export default function query<_Query extends Operation<any, any>>(
	document: GraphQLTagResult
): Readable<_Query['result']> {
	// make sure we got a query document
	if (document.kind !== 'HoudiniQuery') {
		throw new Error('getQuery can only take query operations')
	}

	// if there is no initial value
	if (!document.initialValue) {
		console.log('no initial value')
		// we're done
		return readable(null, () => {})
	}
	console.log('past!')

	// wrap the result in a store we can use to keep this query up to date
	const value = readable(
		document.processResult(document.initialValue.data, document.variables),
		(set) => {
			// build up the store object
			const store = {
				name: document.name,
				updateValue: (val: _Query['result'], variables: _Query['input']) => {
					set(document.processResult(val, variables))
					store.variables = variables
				},
				currentValue: {},
				variables: document.variables,
			}

			// when the component monuts
			onMount(() => {
				// register the updater for the query
				registerDocumentStore(store)

				// keep the stores' values in sync
				value.subscribe((val) => {
					store.currentValue = val
				})
			})

			// the function used to clean up the store
			return () => {
				unregisterDocumentStore(store)
			}
		}
	)

	return value
}