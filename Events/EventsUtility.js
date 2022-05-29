const models = require("../Models");
const { QueryTypes, UniqueConstraintError } = require("sequelize");
const sequelizeInstance = models.sequelizeInstance;
const { isEventExpired } = require("../Utility");
const { addUserToMailChimpEventList } = require("../MailChimp/mailChimpUtility");

async function getAllEvents(req, res, next) {
	/*
		gets all unexpired events :
		{
			event_id,
			event_title,
			event_description,
			event_Date,
			event_time,
			event_venue,
			event_participants
		}
	*/
	try {
		const events = await sequelizeInstance.query(
			`
			select 
				events_new.event_id as event_id,
				event_title, 
				event_description, 
				event_date_time,
				event_venue,
				event_image,
				(count(*) + event_initial_participants) as event_participants 

			from events_new
				left join event_participants on events_new.event_id = event_participants.event_id

			WHERE event_date_time > current_timestamp
			group by events_new.event_id
            order by event_date_time
        `,
			{ logging: false, type: QueryTypes.SELECT, raw: true }
		);
		return res.status(200).send(events);
	} catch (error) {
		next(error);
	}
}

async function getEventDetails(req, res, next) {
	/*
		gets all the details of an event :
		{
			event_title,
			event_description,
			event_Date,
			event_time,
			event_duration,
			event_venue,
			event_learning_outcomes,
			event_speakers
		}
	*/

	try {
		if (await isEventExpired(req.query.id)) {
			return res.status(401).send("This Event has been expired.");
		}

		const event = await sequelizeInstance.query(
			`
			with speaker_ids as (SELECT event_id, speaker_id FROM public.event_speaker_map WHERE event_id = :e_id),
			speaker_table as (
				SELECT speaker_ids.event_id, json_agg(
					json_build_object(
						'id', sp.id,
						'name', sp.name,
						'about', sp.about )) as speakers
				FROM public.event_speakers sp
				JOIN speaker_ids on sp.id = speaker_ids.speaker_id
				GROUP BY speaker_ids.event_id)

			SELECT
				en.event_title as event_title,
				en.event_description as description,
				en.event_date_time as event_date_time,
				en.event_duration as duration,
				en.event_venue as event_venue,
				en.event_learning_outcomes as learning_outcomes,
				en.event_image as event_image,
				(st.speakers),
				COALESCE((SELECT count(event_id) from event_participants where event_id = :e_id group by event_id) + en.event_initial_participants, en.event_initial_participants) as total_participants
			FROM public.events_new en
			LEFT JOIN speaker_table st on st.event_id = en.event_id
			WHERE en.event_id = :e_id
			`,
			{
				replacements: {
					e_id: req.query.id,
				},
				type: QueryTypes.SELECT,
				logging: false,
				raw: true,
			}
		);
		return res.status(200).send(event);
	} catch (error) {
		next(error);
	}
}

async function getPreviousEvents(req, res, next) {
	/*
		gets all expired events :
		{
            event_id,
			event_title,
			event_description,
			event_date_time,
			event_participants
		}
	*/
	try {
		const events = await sequelizeInstance.query(
			`
			select 
                events_new.event_id,
				event_title, 
				event_description, 
				event_date_time,
				event_image,
				(count(*) + event_initial_participants) as event_participants 
		
			FROM events_new
					left join event_participants on events_new.event_id = event_participants.event_id
			
			WHERE event_date_time < current_timestamp
			group by events_new.event_id
            order by event_date_time desc
        `,
			{ logging: false, type: QueryTypes.SELECT, raw: true }
		);
		return res.status(200).send(events);
	} catch (error) {
		next(error);
	}
}

const findMailChimpTagsFromDB = async (event_id) => {
	return await sequelizeInstance.query(
		` select event_tags from events_new where events_new.event_id = $1`,
		{ bind: [event_id], type: QueryTypes.SELECT }
	);
};

async function postEventParticipantDetails(req, res, next) {
	/*
		put the details of a user who is trying to register for a certain event into the event_participants table.
		fields of input :
		{
			name, email, phone_number, organisation, event_id
		}
	*/
	try {
		const participant = req.body;
		if (await isEventExpired(participant.event_id)) {
			return res.status(401).send("This Event has been expired.");
		}

		await sequelizeInstance.query(
			`
			INSERT INTO event_participants VALUES (:name, :email, :phone_number, :organisation, :event_id)
			`,
			{
				replacements: {
					name: participant.name,
					email: participant.email,
					phone_number: participant.phone_number ? participant.phone_number : null,
					organisation: participant.organisation ? participant.organisation : null,
					event_id: participant.event_id,
				},
				logging: false,
				type: QueryTypes.INSERT,
				raw: true,
			}
		);
		let mailChimpEventTag = await findMailChimpTagsFromDB(participant.event_id);
		addUserToMailChimpEventList(
			participant.email,
			participant.name,
			mailChimpEventTag[0].event_tags
		);
		return res.status(200).send("Registration successful");
	} catch (error) {
		if (error instanceof UniqueConstraintError) {
			return res.status(403).send("This user has already registered for this event.");
		}
		return res.status(500).send(error.error[0].message);
	}
}

async function getEventTitle(req, res, next) {
	/*
		get the event_title based on requested event_id from events_new table
		{
			event_title,
		}

	*/
	try {
		const event_title = await sequelizeInstance.query(
			`
			SELECT event_title FROM events_new WHERE event_id = :e_id

			`,
			{
				replacements: {
					e_id: req.query.event_id,
				},
				type: QueryTypes.SELECT,
				logging: false,
				raw: true,
			}
		);
		return res.status(200).send(event_title);
	} catch (error) {
		next(error);
	}
}

module.exports = {
	getAllEvents,
	getEventDetails,
	getPreviousEvents,
	postEventParticipantDetails,
	getEventTitle,
};
