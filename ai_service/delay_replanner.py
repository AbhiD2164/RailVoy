"""
NetworkX Graph Model & Delay Replanning Module
"""
import networkx as nx
from explanation import generate_transfer_explanation

class DelayReplanner:
    def __init__(self):
        self.graph = nx.DiGraph()
        self._build_network_graph()

    def _build_network_graph(self):
        # Build station network graph
        self.graph.add_edge("NDLS", "MTJ", distance=150.0)
        self.graph.add_edge("MTJ", "AGC", distance=87.2)
        self.graph.add_edge("AGC", "GWL", distance=137.3)
        self.graph.add_edge("GWL", "VGLJ", distance=110.6)
        self.graph.add_edge("VGLJ", "BINA", distance=73.7)
        self.graph.add_edge("BINA", "BPL", distance=126.8)

    def evaluate_delay_and_replan(self, train_no: str, current_delay_minutes: int, route_code: str = "MAIN_LINE") -> dict:
        is_delayed = current_delay_minutes > 15
        should_replan = current_delay_minutes >= 30

        alternatives = []
        if should_replan:
            alternatives.append({
                "trainNo": "12951",
                "trainName": "Mumbai New Delhi Rajdhani",
                "departure": "16:30",
                "arrival": "08:30",
                "availableSeats": 14,
                "timeSavedMinutes": current_delay_minutes + 25,
                "explanation": generate_transfer_explanation(train_no, "12951", "Mumbai New Delhi Rajdhani", current_delay_minutes + 25)
            })

        return {
            "isDelayed": is_delayed,
            "delayMinutes": current_delay_minutes,
            "recommendationAvailable": should_replan,
            "alternativeTrains": alternatives
        }

delay_replanner = DelayReplanner()
