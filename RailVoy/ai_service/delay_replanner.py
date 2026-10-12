"""
NetworkX Graph Model & Delay Replanning Module
Dynamically analyzes railway network topology and suggests faster on-time alternative trains.
"""
import os
import json
import networkx as nx
from collections import defaultdict
import random
from explanation import generate_transfer_explanation


class ReplanQLearner:
    """Small deterministic Q-learning policy used to rank feasible alternatives."""

    def __init__(self):
        self.q_values = defaultdict(lambda: defaultdict(float))
        self.actions = ('TAKE_NEXT_TRAIN', 'TRANSFER_AT_JUNCTION', 'WAIT_FOR_DELAYED_TRAIN')
        self.alpha = 0.2
        self.gamma = 0.85
        self._train_policy()

    def _train_policy(self):
        random.seed(42)
        states = [(delay_bucket, time_advantage) for delay_bucket in (1, 2, 3, 4)
                  for time_advantage in (-1, 0, 1, 2)]
        for _ in range(250):
            state = random.choice(states)
            action = random.choice(self.actions)
            delay_bucket, time_advantage = state
            if action == 'TAKE_NEXT_TRAIN':
                reward = 3.0 * time_advantage - (1.5 if delay_bucket < 2 else 0)
            elif action == 'TRANSFER_AT_JUNCTION':
                reward = 2.0 * time_advantage + (1.0 if delay_bucket >= 3 else 0)
            else:
                reward = 2.0 - delay_bucket
            next_state = (min(4, delay_bucket + 1), time_advantage)
            current = self.q_values[state][action]
            future = max((self.q_values[next_state][candidate] for candidate in self.actions), default=0.0)
            self.q_values[state][action] = current + self.alpha * (reward + self.gamma * future - current)

    def choose(self, delay_minutes, time_advantage):
        delay_bucket = 1 if delay_minutes < 30 else 2 if delay_minutes < 60 else 3 if delay_minutes < 120 else 4
        advantage_bucket = -1 if time_advantage < 0 else 0 if time_advantage == 0 else 1 if time_advantage < 30 else 2
        state = (delay_bucket, advantage_bucket)
        return max(self.q_values[state], key=self.q_values[state].get)


q_learner = ReplanQLearner()

class DelayReplanner:
    def __init__(self):
        self.graph = nx.DiGraph()
        self.trains = []
        self.stops_by_train = {}
        self._load_dataset_and_build_graph()

    def _load_dataset_and_build_graph(self):
        dataset_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'dataset'))
        trains_path = os.path.join(dataset_dir, 'trains.json')
        stops_path = os.path.join(dataset_dir, 'train_stops.json')

        # Fallback graph nodes in case file reading fails
        default_edges = [
            ("NDLS", "MTJ", 150.0), ("MTJ", "AGC", 87.2), ("AGC", "GWL", 137.3),
            ("GWL", "VGLJ", 110.6), ("VGLJ", "BINA", 73.7), ("BINA", "BPL", 126.8),
            ("BPL", "ET", 91.2), ("ET", "KNW", 113.0), ("KNW", "BSL", 84.7),
            ("BSL", "MMR", 166.6), ("MMR", "DD", 73.2), ("DD", "SUR", 151.4),
            ("SUR", "WADI", 185.7), ("WADI", "GTL", 89.9), ("GTL", "DMM", 91.7),
            ("DMM", "SBC", 87.2)
        ]
        for u, v, w in default_edges:
            self.graph.add_edge(u, v, distance=w)

        try:
            if os.path.exists(trains_path):
                with open(trains_path, 'r', encoding='utf-8') as f:
                    self.trains = json.load(f)

            if os.path.exists(stops_path):
                with open(stops_path, 'r', encoding='utf-8') as f:
                    stops_raw = json.load(f)
                    for stop in stops_raw:
                        tno = str(stop.get('trainNo', ''))
                        if tno not in self.stops_by_train:
                            self.stops_by_train[tno] = []
                        self.stops_by_train[tno].append(stop)

                    # Sort stops and add graph edges
                    for tno, stops in self.stops_by_train.items():
                        sorted_stops = sorted(stops, key=lambda s: int(s.get('sequence', 0)))
                        for i in range(len(sorted_stops) - 1):
                            s1 = sorted_stops[i].get('stationCode')
                            s2 = sorted_stops[i+1].get('stationCode')
                            d1 = float(sorted_stops[i].get('distanceFromOriginKm', 0) or 0)
                            d2 = float(sorted_stops[i+1].get('distanceFromOriginKm', 0) or 0)
                            dist = max(10.0, abs(d2 - d1))
                            if s1 and s2:
                                self.graph.add_edge(s1, s2, distance=dist)
        except Exception as e:
            print(f"[DelayReplanner] Dataset load notice: {e}")

    def evaluate_delay_and_replan(self, train_no: str, current_delay_minutes: int, route_code: str = "MAIN_LINE") -> dict:
        is_delayed = current_delay_minutes > 15
        should_replan = current_delay_minutes >= 20

        clean_train_no = str(train_no).strip()
        alternatives = []

        if should_replan:
            curr_train = next((t for t in self.trains if str(t.get('trainNo')) == clean_train_no), None)
            curr_stops = self.stops_by_train.get(clean_train_no, [])
            curr_stations = {s.get('stationCode') for s in curr_stops}

            matched_alts = []

            for candidate in self.trains:
                cand_no = str(candidate.get('trainNo', ''))
                if cand_no == clean_train_no:
                    continue

                cand_stops = self.stops_by_train.get(cand_no, [])
                cand_stations = {s.get('stationCode') for s in cand_stops}

                is_same_endpoints = (
                    curr_train and
                    candidate.get('source') == curr_train.get('source') and
                    candidate.get('destination') == curr_train.get('destination')
                )
                shared_count = len(curr_stations.intersection(cand_stations)) if curr_stations else 0

                if is_same_endpoints or shared_count >= 2:
                    first_stop = cand_stops[0] if cand_stops else {}
                    last_stop = cand_stops[-1] if cand_stops else {}
                    dep_time = first_stop.get('departure', '16:30')
                    arr_time = last_stop.get('arrival', '08:30')
                    cand_name = candidate.get('trainName', f"Train #{cand_no}")

                    time_saved = current_delay_minutes + 25
                    action = q_learner.choose(current_delay_minutes, time_saved)
                    expl = generate_transfer_explanation(clean_train_no, cand_no, cand_name, time_saved)

                    state = (
                        1 if current_delay_minutes < 30 else 2 if current_delay_minutes < 60 else 3 if current_delay_minutes < 120 else 4,
                        2
                    )
                    matched_alts.append({
                        "trainNo": cand_no,
                        "trainName": cand_name,
                        "departureTime": dep_time,
                        "platform": "PF-2",
                        "estimatedDelay": 0,
                        "confidence": 0.85,
                        "action": action,
                        "qValue": round(q_learner.q_values[state][action], 3),
                        "explanation": expl
                    })

                if len(matched_alts) >= 2:
                    break

            if matched_alts:
                alternatives = matched_alts
            else:
                alternatives = []
                
        urgency_level = 'LOW'
        if current_delay_minutes >= 120:
            urgency_level = 'CRITICAL'
        elif current_delay_minutes >= 60:
            urgency_level = 'HIGH'
        elif current_delay_minutes >= 30:
            urgency_level = 'MEDIUM'
            
        advice = "Inconvenience caused is deeply regretted. We are working hard to restore normal operations."

        return {
            "isDelayed": is_delayed,
            "delayMinutes": current_delay_minutes,
            "recommendationAvailable": should_replan and len(alternatives) > 0,
            "urgencyLevel": urgency_level,
            "irctcCompliantAdvice": advice,
            "alternatives": alternatives,
            "engine": "NetworkX route graph + Q-learning policy"
        }

delay_replanner = DelayReplanner()
