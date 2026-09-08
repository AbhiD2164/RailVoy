const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const Station = require('./models/Station');
const Train = require('./models/Train');

const DATASET_DIR = path.join(__dirname, '..', 'dataset');

const parseCSV = (filePath) => {
  return new Promise((resolve, reject) => {
    const results = [];
    if (!fs.existsSync(filePath)) return resolve(results);
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (err) => reject(err));
  });
};

const loadDataset = async () => {
  try {
    const stationsRaw = await parseCSV(path.join(DATASET_DIR, 'stations.csv'));
    const trainsRaw = await parseCSV(path.join(DATASET_DIR, 'trains.csv'));
    const stopsRaw = await parseCSV(path.join(DATASET_DIR, 'train_stops.csv'));
    const fareRulesRaw = await parseCSV(path.join(DATASET_DIR, 'fare_rules.csv'));
    const holidaysRaw = await parseCSV(path.join(DATASET_DIR, 'holidays.csv'));
    const demandRaw = await parseCSV(path.join(DATASET_DIR, 'demand_history.csv'));

    // Format stations
    const stations = stationsRaw.map(s => ({
      stationId: s.stationId,
      stationName: s.stationName,
      stationCode: s.stationCode,
      state: s.state
    }));

    // Group stops by trainNo
    const stopsByTrain = {};
    stopsRaw.forEach(s => {
      if (!stopsByTrain[s.trainNo]) stopsByTrain[s.trainNo] = [];
      stopsByTrain[s.trainNo].push({
        sequence: parseInt(s.sequence, 10),
        stationCode: s.stationCode,
        arrival: s.arrival,
        departure: s.departure,
        distanceFromOriginKm: parseFloat(s.distanceFromOriginKm || 0),
        nextSegmentId: s.nextSegmentId || '',
        haltMinutes: parseInt(s.haltMinutes || 0, 10)
      });
    });

    // Helper to determine coach composition and catering tier by train type
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
      return {
        trainNo: t.trainNo,
        trainName: t.trainName,
        trainType: t.trainType,
        source: t.source,
        destination: t.destination,
        stops: (stopsByTrain[t.trainNo] || []).sort((a, b) => a.sequence - b.sequence),
        coachComposition: cfg.coachComposition,
        cateringTier: cfg.cateringTier,
        totalSeats: cfg.totalSeats,
        bookedSeats: cfg.bookedSeats,
        currentDelayMinutes: 0,
        status: 'On Time'
      };
    });

    console.log(`[Dataset Loader] Parsed ${stations.length} stations, ${trains.length} trains, ${stopsRaw.length} train stops.`);

    return { stations, trains, fareRulesRaw, holidaysRaw, demandRaw };
  } catch (err) {
    console.error('[Dataset Loader Error]', err.message);
    return { stations: [], trains: [], fareRulesRaw: [], holidaysRaw: [], demandRaw: [] };
  }
};

const seedDatabase = async () => {
  const dataset = await loadDataset();

  try {
    // Attempt Mongoose DB seed
    await Station.deleteMany({});
    await Station.insertMany(dataset.stations);
    console.log('[Mongoose Seed] Station records seeded to MongoDB.');

    await Train.deleteMany({});
    await Train.insertMany(dataset.trains);
    console.log('[Mongoose Seed] Train records seeded to MongoDB.');
  } catch (err) {
    console.log('[Mongoose Seed Skipped] Using memory dataset mode.');
  }

  return dataset;
};

module.exports = { loadDataset, seedDatabase };
