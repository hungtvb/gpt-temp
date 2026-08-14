package com.acme.keycloak.saml.checker.internal.lifecycle;

import com.liferay.portal.kernel.events.Action;
import com.liferay.saml.persistence.model.SamlSpSession;
import com.liferay.saml.runtime.servlet.profile.WebSsoProfile;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.osgi.service.component.annotations.Component;
import org.osgi.service.component.annotations.Reference;

@Component(
    property = "key=login.events.post",
    service = Action.class
)
public class SamlLoginPostAction extends Action {

    @Override
    public void run(
        HttpServletRequest request, HttpServletResponse response) {

        SamlSpSession samlSpSession = _webSsoProfile.getSamlSpSession(request);

        if (samlSpSession == null) {
            return;
        }

        // Replace this with the project-specific assertion/session policy.
        // Examples:
        // samlSpSession.getSamlIdpEntityId()
        // samlSpSession.getNameIdValue()
        // samlSpSession.getSessionIndex()
        // samlSpSession.getAssertionXml()
    }

    @Reference
    private WebSsoProfile _webSsoProfile;
}
