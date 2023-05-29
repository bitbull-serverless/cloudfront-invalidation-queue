/**
 * AWS Clients
 */
const DynamoDB = require('aws-sdk/clients/dynamodb')
const dynamo = new DynamoDB.DocumentClient({
	logger: console
})
const Cloudfront = require('aws-sdk/clients/cloudfront')
const cloudfront = new Cloudfront({
	logger: console
})

/**
 * Constants
 */
const TABLE_QUEUE_NAME = process.env.TABLE_QUEUE_NAME
const DISTRIBUTION_ID = process.env.DISTRIBUTION_ID
const WILDCARD_PATH = '/*'

/**
 * Retrieve paths by sequence number
 * 
 * @param {number} sequence 
 * @param {object} nextKeys
 * @returns {string[]}
 */
async function retrieveBatchPaths(sequence, nextKeys) {
	const { Items: items, LastEvaluatedKey: lastKeys } = await dynamo.query({
		TableName: TABLE_QUEUE_NAME,
		KeyConditionExpression: '#sequence = :sequence',
		ExpressionAttributeNames: {
			'#sequence': 'sequence'
		},
		ExpressionAttributeValues: {
			':sequence': sequence
		},
		ExclusiveStartKey: nextKeys
	}).promise()

	let paths = items.map(item => item.path)
	if (lastKeys) {
		paths = paths.concat(await retrieveBatchPaths(sequence, lastKeys))
	}

	return paths
}

/**
 * Lambda handler
 * @param {object} event
 * @param {number} event.sequence
 */
exports.handler = async (event) => {
	console.log(JSON.stringify(event))

	if (!event.sequence) {
		throw new Error('Invalid event provided')
	}

	let paths = await retrieveBatchPaths(event.sequence)
	if (paths.length === 0) {
		throw new Error(`Empty batch for sequence number ${event.sequence}`)
	}

	if (paths.includes(WILDCARD_PATH)) {
		paths = [WILDCARD_PATH]
	}

	const { Invalidation: invalidation } = await cloudfront.createInvalidation({
		DistributionId: DISTRIBUTION_ID,
		InvalidationBatch: {
			CallerReference: event.sequence.toString(),
			Paths: {
				Quantity: paths.length,
				Items: paths
			}
		}
	}).promise()

	return invalidation
}
