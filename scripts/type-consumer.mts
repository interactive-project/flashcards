import {createStudyPorts,type Deck,type StudyPolicy,type Rating} from '../index.js';
import {validateDeck} from '../validation/index.js';
declare const deck:Deck;
const policy:StudyPolicy={mode:'seeded-random',seed:12345};
const ports=createStudyPorts({deck,policy,validateDeck});
const rating:Rating='good';void ports;void rating;

import {createStudySession,type StudySessionOptions} from '../session/index.js';
declare const options:StudySessionOptions;
createStudySession(options).then(session=>{session.start();session.getProgress();session.serialize();session.getContext();});
