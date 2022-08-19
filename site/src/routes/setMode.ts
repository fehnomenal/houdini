export async function POST({ locals, request, ...args }) {
	const { mode } = await request.json()
	if (!['store', 'inline'].includes(mode)) {
		return {}
	}

	await locals.session.set({ mode })

	return {
		body: 'OK'
	}
}
