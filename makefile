SHELL := /bin/bash

# Set _29r_dirdefs make macros
TMPF:=$(shell tmpf=$$(mktemp /tmp/ddefs.XXXXXXXXX);_29r_dirdefs-make > $$tmpf;echo $$tmpf)
$(foreach L,$(shell set -- $$(wc -l $(TMPF)); seq $$1),$(eval $(shell sed -ne $(L)p $(TMPF))))
$(shell rm -f $(TMPF))

.PHONY: all install

HTML_VERSIONS := prompt_ai_include.html makefile.html README.html
	# handy for AI to read these.

all:  $(HTML_VERSIONS)

# define $(blding), $(bltok), $(blding_phony), $(bltok_phony) targets- 2_hours_ago, 30min_ago,  newer
# Place this stanza after default target, since has *targets*,
$(_29lib)/make_misc.inc :;
include $(_29lib)/make_misc.inc
	# less $_lib/make_misc.inc

include ~/lib/tsr/webmarkdown/make_m42.inc
  	# Has pandoc suffix rule: %._html : %.markdown
  	# CAREFUL: Has **target** ~/doc/career/tex/misc_dph_macros._m4inc

include $(_29lib)/makefile_29r_suffix_rules.inc
	# true 'makefile_29r_suffix_rules.inc: *m4* extension macro defs, and their build recipes' ;2v -c $_lib/makefile_29r_suffix_rules.inc

WEB_ROOT := /a/webzq
dev_DESTDIR :=  $(WEB_ROOT)/dev
prod_DESTDIR := $(WEB_ROOT)/prod

.PHONY: dev prod
dev prod: ./plar.html ./js/config/plar.json ./js/plsPlayer.js $(HTML_VERSIONS)
	$(blding) ;\
	set -eux;destdir=$($(@)_DESTDIR);\
	mkdir -p $$destdir;\
	rsync -av -R $^ $$destdir;\
	cd $$destdir; pwd;find . -type f

