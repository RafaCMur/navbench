import numpy as np

from navbench.motion import Track


def test_track():
    tr = Track([[0, 0], [3, 0], [3, 4]], speed=2.0)
    assert tr.length == 7
    assert tr.duration == 3.5
    assert np.allclose(tr.position(0), [0, 0])
    assert np.allclose(tr.position(1), [2, 0])
    assert np.allclose(tr.position(2), [3, 1])
    assert np.allclose(tr.position(10), [3, 4])
    assert np.allclose(tr.trail(2), [[0, 0], [3, 0], [3, 1]])
    assert np.allclose(tr.ahead(2), [[3, 1], [3, 4]])
