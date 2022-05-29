const express = require("express");
const router = express.Router();
const {
	getAllEvents,
	getEventDetails,
	getPreviousEvents,
	postEventParticipantDetails,
	getEventTitle,
} = require("./EventsUtility");

router.get("/getAllEvents", getAllEvents);
router.get("/getPreviousEvents", getPreviousEvents);
router.get("/getEventDetails", getEventDetails);
router.post("/postEventParticipantDetails", postEventParticipantDetails);
router.get("/getEventTitle", getEventTitle);

module.exports = router;
