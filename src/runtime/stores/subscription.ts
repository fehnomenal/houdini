import { writable } from 'svelte/store'

import { isBrowser } from '../adapter'
import cache from '../cache'
import {
	CompiledSubscriptionKind,
	ConfigFile,
	deepEquals,
	getCurrentClient,
	getCurrentConfig,
	SubscriptionArtifact,
	SubscriptionStore,
} from '../lib'
import { marshalInputs, unmarshalSelection } from '../lib/scalars'

export function subscriptionStore<_Data, _Input>({
	artifact,
}: {
	artifact: SubscriptionArtifact
}): SubscriptionStore<_Data | null, _Input> {
	// a store that holds the latest value
	const result = writable<_Data | null>(null)

	// @ts-expect-error: typechecking cjs/esm interop is hard
	// pull the query text out of the compiled artifact
	const { raw: text, selection } = artifact.default || artifact

	// the function to call to unregister the subscription
	let clearSubscription = () => {}

	// listen might be called multiple times while mounted
	let lastVariables: _Input | null = null

	return {
		name: artifact.name,
		kind: CompiledSubscriptionKind,
		subscribe: result.subscribe,
		async listen(variables: _Input) {
			// subscription.listen is a no-op on the server
			if (!isBrowser) {
				return
			}
			// pull out the current client
			const config = await getCurrentConfig()
			const env = await getCurrentClient()
			// we need to make sure that the user provided a socket connection
			if (!env.socket) {
				throw new Error(
					'The current Houdini Client is not configured to handle subscriptions. Make sure you ' +
						'passed a socketClient to HoudiniClient constructor.'
				)
			}

			// marshal the inputs into their raw values
			const marshaledVariables = marshalInputs({
				input: variables || {},
				config,
				artifact,
			}) as _Input

			// if the variables haven't changed, don't do anything
			if (deepEquals(lastVariables, marshaledVariables)) {
				return
			}

			// clear any existing subscription
			clearSubscription()

			// save the last set
			lastVariables = marshaledVariables

			// start listening for updates from the server
			clearSubscription = env.socket.subscribe(
				{
					query: text,
					variables: marshaledVariables,
				},
				{
					next({ data, errors }) {
						// make sure there were no errors
						if (errors) {
							throw errors
						}

						// if we got a result
						if (data) {
							// update the cache with the result
							cache.write({
								selection,
								data,
								variables: marshaledVariables,
							})

							// update the local store
							result.set(
								unmarshalSelection(config, artifact.selection, data) as _Data
							)
						}
					},
					error(data) {},
					complete() {},
				}
			)
		},
		unlisten() {
			clearSubscription()
			clearSubscription = () => {}
			lastVariables = null
		},
	}
}
