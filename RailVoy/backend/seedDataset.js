const fs = require('fs');
const path = require('path');
const Station = require('./models/Station');
const Train = require('./models/Train');

const DATASET_DIR = path.join(__dirname, '..', 'dataset');

const readJSON = (fileName, defaultValue = []) => {
  try {
    const filePath = path.join(DATASET_DIR, fileName);
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (err) {
    console.error(`[SeedDataset] Error reading ${fileName}:`, err.message);
  }
  return defaultValue;
};

const loadDataset = async () => {
  try {
    const stationsRaw = readJSON('stations.json');
    const trainsRaw = readJSON('trains.json');
    const stopsRaw = readJSON('train_stops.json');
    const fareRulesRaw = readJSON('fare_rules.json');
    const holidaysRaw = readJSON('holidays.json');
    const demandRaw = readJSON('demand_history.json');

    // Format stations
    const stations = stationsRaw.map(s => ({
      stationId: s.stationId,
      stationName: s.stationName,
      stationCode: s.stationCode,
      state: s.state,
      zone: s.zone || 'NR',
      lat: s.lat,
      lng: s.lng,
      connectingNodes: s.connectingNodes || []
    }));

    // Group stops by trainNo
    const stopsByTrain = {};
    stopsRaw.forEach(s => {
      const tNo = String(s.trainNo);
      if (!stopsByTrain[tNo]) stopsByTrain[tNo] = [];
      stopsByTrain[tNo].push({
        sequence: parseInt(s.sequence, 10),
        stationCode: s.stationCode,
        arrival: s.arrival,
        departure: s.departure,
        distanceFromOriginKm: parseFloat(s.distanceFromOriginKm || 0),
        haltMinutes: parseInt(s.haltMinutes || 0, 10),
        platformNo: parseInt(s.platformNo || 1, 10)
      });
    });

    // Helper for coach config and seating
    const getTrainConfig = (type) => {
      switch (type) {
        case 'Vande Bharat':
          return {
            coachComposition: ['ENG', 'C1', 'C2', 'C3', 'C4', 'E1', 'E2', 'C5', 'C6', 'C7', 'C8', 'ENG'],
            cateringTier: 'luxury',
            totalSeats: { 'CC': 624, 'EC': 104 },
            bookedSeats: { 'CC': 180, 'EC': 32 }
          };
        case 'Tejas':
          return {
            coachComposition: ['ENG', 'C1', 'C2', 'C3', 'E1', 'PC', 'C4', 'C5', 'ENG'],
            cateringTier: 'luxury',
            totalSeats: { 'CC': 390, 'EC': 52 },
            bookedSeats: { 'CC': 110, 'EC': 18 }
          };
        case 'Shatabdi':
          return {
            coachComposition: ['ENG', 'E1', 'E2', 'PC', 'C1', 'C2', 'C3', 'C4', 'C5', 'ENG'],
            cateringTier: 'luxury',
            totalSeats: { 'EC': 104, 'CC': 390 },
            bookedSeats: { 'EC': 28, 'CC': 140 }
          };
        case 'Rajdhani':
        case 'Duronto':
          return {
            coachComposition: ['ENG', 'H1', 'HA1', 'A1', 'A2', 'PC', 'B1', 'B2', 'B3', 'B4', 'AB1', 'GS'],
            cateringTier: 'luxury',
            totalSeats: { '1A': 34, '2A': 142, '3A': 320, 'GS': 90 },
            bookedSeats: { '1A': 12, '2A': 48, '3A': 115, 'GS': 42 }
          };
        case 'Garib Rath':
          return {
            coachComposition: ['ENG', 'GS', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'GS'],
            cateringTier: 'budget',
            totalSeats: { '3A': 576, 'GS': 180 },
            bookedSeats: { '3A': 210, 'GS': 85 }
          };
        case 'Sachkhand':
          return {
            coachComposition: ['ENG', 'GS', 'S1', 'S2', 'S3', 'S4', 'PC', 'B1', 'B2', 'AB1', 'A1', 'HA1', 'H1', 'GS'],
            cateringTier: 'holy',
            totalSeats: { '1A': 34, '2A': 90, '3A': 176, 'SL': 288, 'GS': 180 },
            bookedSeats: { '1A': 8, '2A': 28, '3A': 64, 'SL': 110, 'GS': 90 }
          };
        default:
          return {
            coachComposition: ['ENG', 'GS', 'S1', 'S2', 'S3', 'S4', 'B1', 'B2', 'B3', 'AB1', 'A1', 'HA1', 'H1', 'PC', 'GS'],
            cateringTier: 'standard',
            totalSeats: { '1A': 34, '2A': 90, '3A': 248, 'SL': 288, 'GS': 180 },
            bookedSeats: { '1A': 10, '2A': 32, '3A': 88, 'SL': 95, 'GS': 75 }
          };
      }
    };

    // Format trains
    const trains = trainsRaw.map(t => {
      const cfg = getTrainConfig(t.trainType);
      const tNo = String(t.trainNo);
      // Zero booked seats initially — tickets are only marked booked when booked by real passengers on this website
      const cleanBookedSeats = {};
      Object.keys(cfg.totalSeats).forEach(k => { cleanBookedSeats[k] = 0; });

      return {
        trainNo: tNo,
        trainCode: tNo,
        trainName: t.trainName,
        trainType: t.trainType,
        source: t.source,
        destination: t.destination,
        runDays: t.runDays || [0, 1, 2, 3, 4, 5, 6],
        baseFarePerKm: t.baseFarePerKm || 0.80,
        pantryAvailable: t.pantryAvailable !== false,
        hasPantrycar: t.hasPantrycar != null ? t.hasPantrycar : (t.pantryAvailable !== false),
        stops: (stopsByTrain[tNo] || []).sort((a, b) => a.sequence - b.sequence),
        coachComposition: t.coachComposition || cfg.coachComposition,
        cateringTier: cfg.cateringTier,
        mealServiceHours: t.mealServiceHours || null,
        cateringServices: t.cateringServices || null,
        totalSeats: cfg.totalSeats,
        bookedSeats: cleanBookedSeats,
        currentDelayMinutes: 0,
        status: 'On Time'
      };
    });

    console.log(`[JSON Dataset Loader] Loaded ${stations.length} stations, ${trains.length} trains, ${stopsRaw.length} train stops from JSON.`);

    return { stations, trains, fareRulesRaw, holidaysRaw, demandRaw };
  } catch (err) {
    console.error('[JSON Dataset Loader Error]', err.message);
    return { stations: [], trains: [], fareRulesRaw: [], holidaysRaw: [], demandRaw: [] };
  }
};

const seedDatabase = async () => {
  const dataset = await loadDataset();

  try {
    await Station.deleteMany({});
    await Station.insertMany(dataset.stations);
    console.log('[Mongoose Seed] Station records seeded from JSON.');

    await Train.deleteMany({});
    await Train.insertMany(dataset.trains);
    console.log('[Mongoose Seed] Train records seeded from JSON.');
  } catch (err) {
    console.log('[Mongoose Seed Skipped] Using JSON in-memory dataset mode.');
  }

  return dataset;
};

module.exports = { loadDataset, seedDatabase };
