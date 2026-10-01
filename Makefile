.PHONY: run test purge

run:  ## start the server on http://127.0.0.1:8080
	python3 -m hitchly serve

test:  ## run the test suite
	python3 -m unittest discover -s tests -v

purge:  ## delete expired links
	python3 -m hitchly purge
