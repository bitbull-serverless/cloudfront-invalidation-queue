/**
 * AWS Clients
 */
const DynamoDB = require('aws-sdk/clients/dynamodb')
const dynamo = new DynamoDB.DocumentClient({
	logger: console
})
const StepFunctions = require('aws-sdk/clients/stepfunctions')
const stepfunctions = new StepFunctions({
	logger: console
})

/**
 * Constants
 */
const TABLE_QUEUE_NAME = process.env.TABLE_QUEUE_NAME
const STATE_MACHINE_INVALIDATE_ARN = process.env.STATE_MACHINE_INVALIDATE_ARN
const BATCH_WINDOW_SECONDS = parseInt(process.env.BATCH_WINDOW_SECONDS || 300) // 5 minutes
const BATCH_TTL_SECONDS = parseInt(process.env.BATCH_TTL_SECONDS || 1800) // 30 minutes

/**
 * Lambda handler
 * @param {object} event
 * @param {object} event.detail
 * @param {string[]} event.detail.Paths
 */
exports.handler = async (event) => {
	console.log(JSON.stringify(event))

	if (!event.detail || !Array.isArray(event.detail.Paths) || event.detail.Paths.length === 0) {
		throw new Error('Invalid event provided')
	}

	const currentTimestamp = Math.floor(Date.now() / 1000)
	const sequence = Math.floor(currentTimestamp / BATCH_WINDOW_SECONDS)

	try {
		await stepfunctions.startExecution({
			stateMachineArn: STATE_MACHINE_INVALIDATE_ARN,
			name: sequence.toString(),
			input: JSON.stringify({
				wait: BATCH_WINDOW_SECONDS,
				sequence: sequence,
			}),
		}).promise()
	} catch (error) {
		if (error.code !== 'ExecutionAlreadyExists') {
			throw error
		}
	}

	const paths = event.detail.Paths
	await dynamo.transactWrite({
		TransactItems: paths.map(path => ({
			Put: {
				TableName: TABLE_QUEUE_NAME,
				Item: {
					'sequence': sequence,
					'path': path,
					'ttl': currentTimestamp + BATCH_TTL_SECONDS
				}
			}
		}))
	}).promise()
}
