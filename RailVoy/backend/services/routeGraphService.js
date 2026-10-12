const path = require('path');
const fs = require('fs');

const STATIONS_PATH = path.join(__dirname, '../../dataset/stations.json');
const TRAINS_PATH = path.join(__dirname, '../../dataset/trains.json');

const loadDataset = () => {
  let stations = [];
  let trains = [];
  try {
    if (fs.existsSync(STATIONS_PATH)) stations = JSON.parse(fs.readFileSync(STATIONS_PATH, 'utf8'));
    if (fs.existsSync(TRAINS_PATH)) trains = JSON.parse(fs.readFileSync(TRAINS_PATH, 'utf8'));
  } catch (e) {}
  return { stations, trains };
};

/**
 * Builds directed adjacency graph of Indian Railway network
 */
const buildRailwayGraph = (trains, stations) => {
  const graph = new Map(); // stationCode -> Map<targetStationCode, EdgeInfo>

  // Initialize station nodes
  stations.forEach(s => {
    graph.set(s.stationCode, new Map());
  });

  // Populate edges from train stops
  trains.forEach(t => {
    const stops = t.stops || [];
    for (let i = 0; i < stops.length - 1; i++) {
      const from = stops[i].stationCode;
      const to = stops[i + 1].stationCode;
      const dist = Math.abs((stops[i + 1].distanceFromOriginKm || 0) - (stops[i].distanceFromOriginKm || 0)) || 80;

      if (!graph.has(from)) graph.set(from, new Map());
      if (!graph.has(to)) graph.set(to, new Map());

      const edgeMap = graph.get(from);
      if (!edgeMap.has(to)) {
        edgeMap.set(to, {
          target: to,
          distanceKm: dist,
          trains: []
        });
      }
      const edge = edgeMap.get(to);
      edge.trains.push({
        trainNo: t.trainNo,
        trainName: t.trainName,
        departure: stops[i].departure || '08:00',
        arrival: stops[i + 1].arrival || '12:00'
      });
      edge.trainNumbers = [...new Set(edge.trains.map(train => String(train.trainNo)))];
    }
  });

  return graph;
};

/**
 * Determine exact trains, route connectivity, and multi-hop paths between any two stations
 */
const determineRouteConnectivity = (fromCode, toCode, customTrains = null, customStations = null) => {
  const { stations: defaultStations, trains: defaultTrains } = loadDataset();
  const stations = customStations && customStations.length > 0 ? customStations : defaultStations;
  const trains = customTrains && customTrains.length > 0 ? customTrains : defaultTrains;

  const cleanFrom = (fromCode || '').toUpperCase().trim();
  const cleanTo = (toCode || '').toUpperCase().trim();

  if (!cleanFrom || !cleanTo) {
    return { error: 'Source and destination stations required' };
  }

  const fromStationObj = stations.find(s => s.stationCode === cleanFrom) || { stationCode: cleanFrom, stationName: cleanFrom };
  const toStationObj = stations.find(s => s.stationCode === cleanTo) || { stationCode: cleanTo, stationName: cleanTo };

  // 1. Check Direct Trains
  const directTrains = [];
  trains.forEach(t => {
    const stops = t.stops || [];
    const fromIdx = stops.findIndex(s => s.stationCode === cleanFrom);
    const toIdx = stops.findIndex(s => s.stationCode === cleanTo);

    if (fromIdx !== -1 && toIdx !== -1 && fromIdx < toIdx) {
      const dist = Math.abs((stops[toIdx].distanceFromOriginKm || 0) - (stops[fromIdx].distanceFromOriginKm || 0));
      const intermediateStops = stops.slice(fromIdx + 1, toIdx).map(s => ({
        stationCode: s.stationCode,
        stationName: s.stationName || s.stationCode,
        arrival: s.arrival,
        departure: s.departure
      }));

      directTrains.push({
        trainNo: t.trainNo,
        trainName: t.trainName,
        trainType: t.trainType,
        departureTime: stops[fromIdx].departure,
        arrivalTime: stops[toIdx].arrival,
        distanceKm: dist || 450,
        intermediateStopsCount: intermediateStops.length,
        intermediateStops,
        pantryAvailable: t.pantryAvailable !== false
      });
    }
  });

  if (directTrains.length > 0) {
    return {
      connected: true,
      connectionType: 'DIRECT',
      from: fromStationObj,
      to: toStationObj,
      directTrainsCount: directTrains.length,
      directTrains,
      recommendedTrain: directTrains[0],
      totalDistanceKm: directTrains[0].distanceKm,
      summary: `Direct railway connection available via ${directTrains.length} scheduled express train(s).`
    };
  }

  // 2. BFS Pathfinding for Connecting Junctions
  const graph = buildRailwayGraph(trains, stations);
  const queue = [[cleanFrom]];
  const visited = new Set([cleanFrom]);
  let connectingRoute = null;

  while (queue.length > 0) {
    const currentPath = queue.shift();
    const currentNode = currentPath[currentPath.length - 1];

    if (currentNode === cleanTo) {
      connectingRoute = currentPath;
      break;
    }

    const neighbors = graph.get(currentNode);
    if (neighbors) {
      for (const [nextStation] of neighbors.entries()) {
        if (!visited.has(nextStation)) {
          visited.add(nextStation);
          queue.push([...currentPath, nextStation]);
        }
      }
    }
  }

  if (connectingRoute) {
    // Build route breakdown
    const segments = [];
    let totalDist = 0;

    for (let i = 0; i < connectingRoute.length - 1; i++) {
      const u = connectingRoute[i];
      const v = connectingRoute[i + 1];
      const edge = graph.get(u)?.get(v);
      const dist = edge ? edge.distanceKm : 100;
      totalDist += dist;

      segments.push({
        fromStation: u,
        toStation: v,
        distanceKm: dist,
        availableTrains: edge ? edge.trains : [],
        trainNumbers: edge ? edge.trainNumbers : []
      });
    }

    const junctionStations = connectingRoute.slice(1, -1);

    return {
      connected: true,
      connectionType: 'TRANSFER_JUNCTION',
      from: fromStationObj,
      to: toStationObj,
      junctionTransferCount: junctionStations.length,
      junctionStations,
      fullStationPath: connectingRoute,
      totalDistanceKm: totalDist,
      segments,
      summary: `No direct train. Optimal connecting route found via ${junctionStations.join(', ')} junction interchange (${connectingRoute.length - 1} leg(s), ${totalDist} km).`
    };
  }

  return {
    connected: false,
    connectionType: 'UNCONNECTED',
    from: fromStationObj,
    to: toStationObj,
    summary: `No scheduled railway connectivity found between ${cleanFrom} and ${cleanTo}.`
  };
};

module.exports = {
  buildRailwayGraph,
  determineRouteConnectivity,
  loadDataset
};
