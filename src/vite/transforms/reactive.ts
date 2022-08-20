import { walk } from 'estree-walker'
import { Config } from '../../common'
import { TransformPage } from '../plugin'
import * as recast from 'recast'

const AST = recast.types.builders

type VariableDeclaration = recast.types.namedTypes.VariableDeclaration
type VariableDeclarator = recast.types.namedTypes.VariableDeclarator
type CallExpression = recast.types.namedTypes.CallExpression

export default async function ReactiveProcessor(config: Config, page: TransformPage) {
	// if a file imports graphql from $houdini then they might have an inline document
	// that needs to be transformed into a reactive statement.
	// in order to avoid situations where graphql`` is passed around to functions we are going to
	// look for graphql`` being passed specifically to a function that matches some list
	// being used as an assignemtn
	//
	// ie:
	//
	// const { foo } = query(graphql``) -> $: ({ foo } = query(graphql``))
	//

	// look for the list of magic functions the user has imported
	const magicFunctions = ['query', 'graphql', 'fragment', 'paginatedFragment', 'paginatedQuery']

	// if they didn't import graphql and at least something else, there's nothing to do
	if (!magicFunctions.includes('graphql') || magicFunctions.length === 1) {
		return
	}

	// now we have to transform any variable declarations that aren't already
	walk(page.script, {
		enter(node) {
			// we are looking for variable declarations
			if (node.type !== 'VariableDeclaration') {
				return
			}
			const expr = node as VariableDeclaration

			// we only care about declarations whose value is a call expression
			if (
				expr.declarations.length !== 1 ||
				expr.declarations[0].type !== 'VariableDeclarator'
			) {
				return
			}
			const declaration = expr.declarations[0] as VariableDeclarator

			// the right hand side of the declaration has to be a call expression
			// that matches a magic function that was imported from the runtime
			if (
				declaration.init?.type !== 'CallExpression' ||
				declaration.init.callee.type !== 'Identifier' ||
				!magicFunctions.includes(declaration.init.callee.name)
			) {
				return
			}
			const callExpr = declaration.init as CallExpression

			// one of the arguments to the function must be a tagged template literal
			// with the graphql tag
			const tag = callExpr.arguments.find(
				(arg) =>
					arg.type === 'TaggedTemplateExpression' &&
					arg.tag.type === 'Identifier' &&
					arg.tag.name === 'graphql'
			)
			if (!tag) {
				return
			}

			// if we got this far then we have a declaration of an inline document so
			// we need to replace it with a reactive statement that recreates it
			this.replace(
				AST.labeledStatement(
					AST.identifier('$'),
					AST.expressionStatement(AST.assignmentExpression('=', declaration.id, callExpr))
				)
			)
		},
	})
}