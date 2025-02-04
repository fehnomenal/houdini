import * as graphql from 'graphql'
import fetch from 'node-fetch'

import { writeFile } from '../../common/fs'

export async function pullSchema(
	url: string,
	schemaPath: string,
	headers?: Record<string, string>
) {
	try {
		// send the request
		const resp = await fetch(url, {
			method: 'POST',
			body: JSON.stringify({
				query: graphql.getIntrospectionQuery(),
			}),
			headers: { 'Content-Type': 'application/json', ...headers },
		})
		const content = await resp.text()

		const jsonSchema = JSON.parse(content).data
		const schema = graphql.buildClientSchema(jsonSchema)

		// Check if the schemapath ends with .gql or .graphql - if so write the schema as string
		// Otherwise write the json/introspection
		if (schemaPath!.endsWith('gql') || schemaPath!.endsWith('graphql')) {
			const schemaAsString = graphql.printSchema(graphql.lexicographicSortSchema(schema))
			await writeFile(schemaPath, schemaAsString)
		} else {
			await writeFile(schemaPath, JSON.stringify(jsonSchema))
		}

		// return the schema for usage in --pull-schema
		return schema
	} catch (e) {
		console.log(`❌ Encountered error when pulling your latest schema: ` + (e as Error).message)
		process.exit(0)
	}
}
