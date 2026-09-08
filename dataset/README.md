RailVoy Dummy Railway Dataset
=============================
SYNTHETIC DATA ONLY. Not official Indian Railways/IRCTC/NTES data.

Files:
stations.csv
trains.csv
track_segments.csv
train_stops.csv
fare_rules.csv
holidays.csv
demand_history.csv

Graph model:
- Stations are graph nodes.
- track_segments are unique directed edges.
- Each edge stores its segment distance once.
- train_stops stores ordered train stoppages and a nextSegmentId pointer.
- distanceFromOriginKm is a timetable convenience field; infrastructure distance should be
  calculated by summing track segment distances for the requested path.

Use this dataset for API development, MongoDB seeding, graph testing and AI prototyping only.
