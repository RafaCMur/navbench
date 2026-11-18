from navbench.scenes import TIDY, tidy_run


def test_tidy_run():
    for name in ["A*", "RRT*"]:
        world, steps = tidy_run(name, 3)
        assert [s["do"] for s in steps] == [a for a, _ in TIDY], name
        assert world.get_object_by_name("soda").parent.parent.name == "trash"
        assert not world.get_entity_by_name("trash").is_open
