import numpy as np


class Track:
    """A path driven at constant speed, so we can ask where the robot is at time t."""

    def __init__(self, xy, speed=1.0):
        self.xy = np.asarray(xy, dtype=float)
        self.speed = speed
        seg = np.linalg.norm(np.diff(self.xy, axis=0), axis=1)
        self.cum = np.concatenate([[0.0], np.cumsum(seg)])
        self.length = self.cum[-1]
        self.duration = self.length / speed

    @classmethod
    def from_path(cls, path, speed=1.0):
        return cls([[p.x, p.y] for p in path.poses], speed)

    def dist(self, t):
        return min(self.speed * t, self.length)

    def position(self, t):
        s = self.dist(t)
        return np.array([np.interp(s, self.cum, self.xy[:, 0]), np.interp(s, self.cum, self.xy[:, 1])])

    def trail(self, t):
        """Points driven so far, ending at the current position."""
        keep = self.cum < self.dist(t)
        return np.vstack([self.xy[keep], self.position(t)])

    def ahead(self, t):
        """Points still to drive, starting at the current position."""
        keep = self.cum > self.dist(t)
        return np.vstack([self.position(t), self.xy[keep]])
